//! Sandbox integration tests.
//!
//! Requires the contract wasm to be built first:
//!
//! ```sh
//! cargo near build non-reproducible-wasm
//! ```

use near_api::{
    Account, Contract, NetworkConfig, Signer,
    signer::generate_secret_key,
    types::{
        AccountId, Data,
        transaction::actions::{AccessKeyPermission, FunctionCallPermission},
    },
};
use near_sandbox::config::{DEFAULT_GENESIS_ACCOUNT, DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY};
use std::sync::Arc;

const RAW_ID: &str = "AQEBAQEBAQEBAQEBAQEBAQ"; // base64url([1u8; 16])
const ED25519_KEY: &str = "ed25519:6E8sCci9badyRkXb3JoRpBj5p8C6Tw41ELDZoiihKEtp";

fn wasm() -> Vec<u8> {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/target/near/passkeys_registry.wasm"
    );
    std::fs::read(path).unwrap_or_else(|e| {
        panic!("{path}: {e}; run `cargo near build non-reproducible-wasm` first")
    })
}

fn p256_key() -> String {
    let bytes: Vec<u8> = [0x02].iter().chain([7u8; 32].iter()).copied().collect();
    format!("p256:{}", bs58::encode(bytes).into_string())
}

async fn setup() -> (near_sandbox::Sandbox, NetworkConfig, AccountId, Arc<Signer>) {
    let sandbox = near_sandbox::Sandbox::start_sandbox().await.unwrap();
    let network = NetworkConfig::from_rpc_url("sandbox", sandbox.rpc_addr.parse().unwrap());

    let account: AccountId = DEFAULT_GENESIS_ACCOUNT.into();
    let signer =
        Signer::from_secret_key(DEFAULT_GENESIS_ACCOUNT_PRIVATE_KEY.parse().unwrap()).unwrap();

    Contract::deploy(account.clone())
        .use_code(wasm())
        .without_init_call()
        .with_signer(signer.clone())
        .send_to(&network)
        .await
        .unwrap()
        .assert_success();

    (sandbox, network, account, signer)
}

async fn get(network: &NetworkConfig, contract_id: &AccountId, raw_id: &str) -> Vec<String> {
    let result: Data<Vec<String>> = Contract(contract_id.clone())
        .call_function("get", serde_json::json!({ "passkey_raw_id": raw_id }))
        .read_only()
        .fetch_from(network)
        .await
        .unwrap();
    result.data
}

#[tokio::test]
async fn register_get_roundtrip() {
    let (_sandbox, network, contract_id, signer) = setup().await;
    let contract = Contract(contract_id.clone());

    // unknown rawId -> empty
    assert!(get(&network, &contract_id, RAW_ID).await.is_empty());

    // register both curves + idempotent repeat
    for key in [p256_key(), ED25519_KEY.to_string(), p256_key()] {
        contract
            .call_function(
                "register",
                serde_json::json!({
                    "passkey_raw_id": RAW_ID,
                    "passkey_public_key": key,
                }),
            )
            .transaction()
            .with_signer(contract_id.clone(), signer.clone())
            .send_to(&network)
            .await
            .unwrap()
            .assert_success();
    }

    assert_eq!(
        get(&network, &contract_id, RAW_ID).await,
        vec![p256_key(), ED25519_KEY.to_string()],
        "registration order preserved, duplicates deduplicated",
    );

    // malformed input is rejected on-chain
    let outcome = contract
        .call_function(
            "register",
            serde_json::json!({
                "passkey_raw_id": "shrt",
                "passkey_public_key": p256_key(),
            }),
        )
        .transaction()
        .with_signer(contract_id.clone(), signer.clone())
        .send_to(&network)
        .await
        .unwrap();
    assert!(outcome.is_failure(), "too-short rawId must be rejected");
}

/// Mirrors production: registrations go through a function-call access key
/// on the contract account, restricted to the `register` method, whose
/// private key ships publicly inside the passkey executor.
#[tokio::test]
async fn register_via_restricted_function_call_key() {
    let (_sandbox, network, contract_id, root_signer) = setup().await;
    let contract = Contract(contract_id.clone());

    // create the restricted key, as the deploy runbook does
    let restricted_secret = generate_secret_key().unwrap();
    Account(contract_id.clone())
        .add_key(
            AccessKeyPermission::FunctionCall(FunctionCallPermission {
                allowance: None, // unlimited gas allowance
                receiver_id: contract_id.to_string(),
                method_names: vec!["register".to_string()],
            }),
            restricted_secret.public_key(),
        )
        .with_signer(root_signer)
        .send_to(&network)
        .await
        .unwrap()
        .assert_success();

    // this is what the executor does with its embedded key
    let restricted_signer = Signer::from_secret_key(restricted_secret).unwrap();
    contract
        .call_function(
            "register",
            serde_json::json!({
                "passkey_raw_id": RAW_ID,
                "passkey_public_key": p256_key(),
            }),
        )
        .transaction()
        .with_signer(contract_id.clone(), restricted_signer.clone())
        .send_to(&network)
        .await
        .unwrap()
        .assert_success();

    assert_eq!(get(&network, &contract_id, RAW_ID).await, vec![p256_key()]);

    // the same key must NOT be able to call any other method
    let forbidden = contract
        .call_function("get", serde_json::json!({ "passkey_raw_id": RAW_ID }))
        .transaction()
        .with_signer(contract_id.clone(), restricted_signer)
        .send_to(&network)
        .await;
    assert!(
        forbidden.is_err() || forbidden.unwrap().is_failure(),
        "restricted key must only be allowed to call `register`",
    );
}
