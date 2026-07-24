/**
 * Minimal, dependency-free internationalization for the executor's
 * user-facing strings.
 *
 * Languages: the five most widely spoken worldwide by total speakers —
 * English (`en`), Mandarin Chinese (`zh`), Hindi (`hi`), Spanish (`es`),
 * French (`fr`). All five are left-to-right; if a right-to-left language
 * (e.g. Arabic) is ever added, the dialog container in `ui.ts` must also set
 * `dir="rtl"`.
 *
 * The active language is detected once from `navigator.languages` and can be
 * overridden with {@link setLang}. Missing keys fall back to English, then to
 * the key itself, so a partial translation never renders an empty string.
 */

export type Lang = "en" | "zh" | "hi" | "es" | "fr";

export const SUPPORTED_LANGS: readonly Lang[] = ["en", "zh", "hi", "es", "fr"];

type Params = Record<string, string | number>;
type Catalog = Record<string, string>;

const en: Catalog = {
  appTitle: "Trezu",
  appTagline: "No password, no seed phrase — just your device.",
  signUp: "Sign up",
  signIn: "Sign in",

  addAccountTitle: "Add another account",
  addAccountSubtitle: "Enter a username or email to tell your accounts apart",
  usernameOrEmailPlaceholder: "username or email",
  continue: "Continue",

  registrationFailedTitle: "Registration failed",
  registrationNotRegisteredWarning:
    "Your passkey was created but is not registered yet. Without registration it cannot be recovered on other devices.",
  retry: "Retry",
  cancel: "Cancel",
  close: "Close",
  passkeyNotRegisteredTitle: "Passkey not registered",

  createPasskeyTitle: "Create your passkey",
  createPasskeySubtitle: "Confirm with your device when it asks",
  registeringTitle: "Registering your passkey",
  registeringSubtitle: "Publishing its public key on NEAR…",
  approveTxTitle: "Approve transaction",
  approveTxSubtitle: "Confirm with your device to approve.",
  approveBtn: "Approve",
  signMsgTitle: "Confirm signature",
  signMsgSubtitle: "Confirm with your device to sign this message.",
  signBtn: "Sign",
  confirmSignInTitle: "Confirm sign-in",
  confirmSignInSubtitle: "Confirm with your device to sign in.",
  confirmSignInBtn: "Sign in",
  confirmSignInAgainSubtitle: "Confirm once more with your device.",
  lookingUpTitle: "Looking up your account",
  lookingUpSubtitle: "Resolving your passkey on NEAR…",
  signingInTitle: "Signing you in",
  signingInFinalizeSubtitle: "Finalizing your account on NEAR…",
  signingInSetupSubtitle: "Setting up your account on NEAR…",
  usePasskeyTitle: "Use your passkey",
  usePasskeySubtitle: "Pick a passkey and confirm with your device",

  errOrphan:
    "Your device created a passkey this wallet can't use. Please open your device's password / passkey settings, delete the passkey you just created for this site, then try again on a different device.",
  errNonResident:
    "Your device created a passkey that can't be recovered later (it isn't a resident key). Please try a different device or use your phone to create the passkey.",
  errNotVerified:
    "Your device signed in without verifying it's you. Please set up Face ID, a fingerprint, a screen lock, or a security-key PIN, then try again.",
  errWrongPasskey:
    "That was a different passkey than this account. Please try again and choose this account's passkey.",
  errNotRegistered:
    "This passkey is not registered in the passkeys registry (or the registered keys do not match its signature). Create it again on the original device or register it first.",
  errRegistrationCancelled: "Passkey registration cancelled: {message}",
  errNotSignedIn: "Wallet not signed in",

  waCancelledCreate:
    "Passkey creation was cancelled or timed out. Please try again and confirm with your device when it asks.",
  waCancelledGet:
    "Sign-in was cancelled or timed out. Please try again and confirm with your device when it asks.",
  waDuplicate: "You already have an account on this device. Choose “Sign in” to use it.",
  waNotSupportedCreate:
    "This device can't create the kind of passkey this wallet needs. Try another device, or use your phone to scan the sign-in QR code.",
  waNotSupportedGet:
    "This device can't sign in with a passkey. Try the device where you first created it, or use your phone to scan the QR code.",
  waConstraintCreate:
    "Your device or security key needs a PIN, fingerprint, or face unlock set up before it can create this passkey. Add one in your device settings and try again.",
  waConstraintGet:
    "Your security key needs a PIN or your device needs a screen lock to sign in. Set one up and try again.",
  waSecurity:
    "This site isn't allowed to use passkeys right now. Make sure you're on the correct website and it's loaded over a secure (https) connection.",
  waGenericCreate:
    "Something went wrong creating your passkey. Please try again, and make sure your device's screen lock (Face ID, fingerprint, or PIN) is set up.",
  waGenericGet:
    "Something went wrong signing in with your passkey. Please try again on the device where you created it.",
};

const zh: Catalog = {
  appTitle: "Trezu",
  appTagline: "无需密码，无需助记词——只需你的设备。",
  signUp: "注册",
  signIn: "登录",

  addAccountTitle: "添加另一个账户",
  addAccountSubtitle: "输入用户名或邮箱以区分你的账户",
  usernameOrEmailPlaceholder: "用户名或邮箱",
  continue: "继续",

  registrationFailedTitle: "注册失败",
  registrationNotRegisteredWarning:
    "你的通行密钥已创建，但尚未注册。未注册将无法在其他设备上恢复。",
  retry: "重试",
  cancel: "取消",
  close: "关闭",
  passkeyNotRegisteredTitle: "通行密钥未注册",

  createPasskeyTitle: "创建你的通行密钥",
  createPasskeySubtitle: "在设备提示时进行确认",
  registeringTitle: "正在注册你的通行密钥",
  registeringSubtitle: "正在将其公钥发布到 NEAR…",
  approveTxTitle: "批准交易",
  approveTxSubtitle: "用你的设备确认以批准。",
  approveBtn: "批准",
  signMsgTitle: "确认签名",
  signMsgSubtitle: "用你的设备确认以签署此消息。",
  signBtn: "签名",
  confirmSignInTitle: "确认登录",
  confirmSignInSubtitle: "用你的设备确认以登录。",
  confirmSignInBtn: "登录",
  confirmSignInAgainSubtitle: "请再次用你的设备确认。",
  lookingUpTitle: "正在查找你的账户",
  lookingUpSubtitle: "正在 NEAR 上解析你的通行密钥…",
  signingInTitle: "正在登录",
  signingInFinalizeSubtitle: "正在 NEAR 上完成你的账户…",
  signingInSetupSubtitle: "正在 NEAR 上设置你的账户…",
  usePasskeyTitle: "使用你的通行密钥",
  usePasskeySubtitle: "选择一个通行密钥并用你的设备确认",

  errOrphan:
    "你的设备创建了一个此钱包无法使用的通行密钥。请打开设备的密码/通行密钥设置，删除你刚为本站点创建的通行密钥，然后换一台设备重试。",
  errNonResident:
    "你的设备创建了一个之后无法恢复的通行密钥（它不是常驻密钥）。请换一台设备，或用你的手机创建通行密钥。",
  errNotVerified:
    "你的设备在未验证你身份的情况下登录。请设置 Face ID、指纹、屏幕锁或安全密钥 PIN，然后重试。",
  errWrongPasskey: "所选通行密钥与此账户不符。请重试并选择此账户的通行密钥。",
  errNotRegistered:
    "此通行密钥未在通行密钥注册表中注册（或已注册的密钥与其签名不匹配）。请在原设备上重新创建，或先进行注册。",
  errRegistrationCancelled: "通行密钥注册已取消：{message}",
  errNotSignedIn: "钱包未登录",

  waCancelledCreate: "通行密钥创建已取消或超时。请重试，并在设备提示时进行确认。",
  waCancelledGet: "登录已取消或超时。请重试，并在设备提示时进行确认。",
  waDuplicate: "你在此设备上已有一个账户。请选择“登录”以使用它。",
  waNotSupportedCreate:
    "此设备无法创建此钱包所需类型的通行密钥。请换一台设备，或用你的手机扫描登录二维码。",
  waNotSupportedGet:
    "此设备无法使用通行密钥登录。请使用你最初创建它的设备，或用你的手机扫描二维码。",
  waConstraintCreate:
    "你的设备或安全密钥需要先设置 PIN、指纹或面部解锁，才能创建此通行密钥。请在设备设置中添加后重试。",
  waConstraintGet: "你的安全密钥需要 PIN，或你的设备需要屏幕锁才能登录。设置后请重试。",
  waSecurity:
    "此站点当前不被允许使用通行密钥。请确认你在正确的网站上，并且通过安全（https）连接加载。",
  waGenericCreate: "创建通行密钥时出错。请重试，并确保已设置设备的屏幕锁（Face ID、指纹或 PIN）。",
  waGenericGet: "使用通行密钥登录时出错。请在你创建它的设备上重试。",
};

const hi: Catalog = {
  appTitle: "Trezu",
  appTagline: "कोई पासवर्ड नहीं, कोई सीड फ़्रेज़ नहीं — बस आपका डिवाइस।",
  signUp: "साइन अप करें",
  signIn: "साइन इन करें",

  addAccountTitle: "एक और खाता जोड़ें",
  addAccountSubtitle: "अपने खातों को अलग पहचानने के लिए यूज़रनेम या ईमेल दर्ज करें",
  usernameOrEmailPlaceholder: "यूज़रनेम या ईमेल",
  continue: "जारी रखें",

  registrationFailedTitle: "पंजीकरण विफल",
  registrationNotRegisteredWarning:
    "आपकी पासकी बन गई है लेकिन अभी पंजीकृत नहीं है। पंजीकरण के बिना इसे अन्य डिवाइस पर पुनर्प्राप्त नहीं किया जा सकता।",
  retry: "पुनः प्रयास करें",
  cancel: "रद्द करें",
  close: "बंद करें",
  passkeyNotRegisteredTitle: "पासकी पंजीकृत नहीं है",

  createPasskeyTitle: "अपनी पासकी बनाएँ",
  createPasskeySubtitle: "जब आपका डिवाइस पूछे तो पुष्टि करें",
  registeringTitle: "आपकी पासकी पंजीकृत हो रही है",
  registeringSubtitle: "इसकी सार्वजनिक कुंजी NEAR पर प्रकाशित हो रही है…",
  approveTxTitle: "लेन-देन स्वीकृत करें",
  approveTxSubtitle: "स्वीकृत करने के लिए अपने डिवाइस से पुष्टि करें।",
  approveBtn: "स्वीकृत करें",
  signMsgTitle: "हस्ताक्षर की पुष्टि करें",
  signMsgSubtitle: "इस संदेश पर हस्ताक्षर करने के लिए अपने डिवाइस से पुष्टि करें।",
  signBtn: "हस्ताक्षर करें",
  confirmSignInTitle: "साइन इन की पुष्टि करें",
  confirmSignInSubtitle: "साइन इन करने के लिए अपने डिवाइस से पुष्टि करें।",
  confirmSignInBtn: "साइन इन करें",
  confirmSignInAgainSubtitle: "अपने डिवाइस से एक बार फिर पुष्टि करें।",
  lookingUpTitle: "आपका खाता खोजा जा रहा है",
  lookingUpSubtitle: "NEAR पर आपकी पासकी हल की जा रही है…",
  signingInTitle: "आपको साइन इन किया जा रहा है",
  signingInFinalizeSubtitle: "NEAR पर आपका खाता अंतिम रूप दिया जा रहा है…",
  signingInSetupSubtitle: "NEAR पर आपका खाता सेट किया जा रहा है…",
  usePasskeyTitle: "अपनी पासकी का उपयोग करें",
  usePasskeySubtitle: "एक पासकी चुनें और अपने डिवाइस से पुष्टि करें",

  errOrphan:
    "आपके डिवाइस ने एक ऐसी पासकी बनाई जिसे यह वॉलेट उपयोग नहीं कर सकता। कृपया अपने डिवाइस की पासवर्ड / पासकी सेटिंग्स खोलें, इस साइट के लिए अभी बनाई गई पासकी हटाएँ, फिर किसी दूसरे डिवाइस पर पुनः प्रयास करें।",
  errNonResident:
    "आपके डिवाइस ने एक ऐसी पासकी बनाई जिसे बाद में पुनर्प्राप्त नहीं किया जा सकता (यह रेज़िडेंट कुंजी नहीं है)। कृपया कोई दूसरा डिवाइस आज़माएँ या पासकी बनाने के लिए अपने फ़ोन का उपयोग करें।",
  errNotVerified:
    "आपके डिवाइस ने आपकी पहचान सत्यापित किए बिना साइन इन किया। कृपया Face ID, फ़िंगरप्रिंट, स्क्रीन लॉक, या सुरक्षा-कुंजी PIN सेट करें, फिर पुनः प्रयास करें।",
  errWrongPasskey:
    "यह इस खाते से अलग पासकी थी। कृपया पुनः प्रयास करें और इस खाते की पासकी चुनें।",
  errNotRegistered:
    "यह पासकी पासकी रजिस्ट्री में पंजीकृत नहीं है (या पंजीकृत कुंजियाँ इसके हस्ताक्षर से मेल नहीं खातीं)। इसे मूल डिवाइस पर फिर से बनाएँ या पहले पंजीकृत करें।",
  errRegistrationCancelled: "पासकी पंजीकरण रद्द किया गया: {message}",
  errNotSignedIn: "वॉलेट साइन इन नहीं है",

  waCancelledCreate:
    "पासकी निर्माण रद्द हुआ या समय समाप्त हो गया। कृपया पुनः प्रयास करें और जब आपका डिवाइस पूछे तो पुष्टि करें।",
  waCancelledGet:
    "साइन इन रद्द हुआ या समय समाप्त हो गया। कृपया पुनः प्रयास करें और जब आपका डिवाइस पूछे तो पुष्टि करें।",
  waDuplicate: "इस डिवाइस पर आपके पास पहले से एक खाता है। इसे उपयोग करने के लिए “साइन इन करें” चुनें।",
  waNotSupportedCreate:
    "यह डिवाइस इस वॉलेट के लिए आवश्यक प्रकार की पासकी नहीं बना सकता। कोई दूसरा डिवाइस आज़माएँ, या साइन-इन QR कोड स्कैन करने के लिए अपने फ़ोन का उपयोग करें।",
  waNotSupportedGet:
    "यह डिवाइस पासकी से साइन इन नहीं कर सकता। जिस डिवाइस पर आपने इसे बनाया था उसे आज़माएँ, या QR कोड स्कैन करने के लिए अपने फ़ोन का उपयोग करें।",
  waConstraintCreate:
    "इस पासकी को बनाने से पहले आपके डिवाइस या सुरक्षा कुंजी में PIN, फ़िंगरप्रिंट, या फ़ेस अनलॉक सेट होना चाहिए। इसे अपने डिवाइस सेटिंग्स में जोड़ें और पुनः प्रयास करें।",
  waConstraintGet:
    "साइन इन करने के लिए आपकी सुरक्षा कुंजी को PIN या आपके डिवाइस को स्क्रीन लॉक चाहिए। इसे सेट करें और पुनः प्रयास करें।",
  waSecurity:
    "यह साइट अभी पासकी का उपयोग करने की अनुमति नहीं है। सुनिश्चित करें कि आप सही वेबसाइट पर हैं और यह सुरक्षित (https) कनेक्शन पर लोड है।",
  waGenericCreate:
    "आपकी पासकी बनाते समय कुछ गड़बड़ हुई। कृपया पुनः प्रयास करें और सुनिश्चित करें कि आपके डिवाइस का स्क्रीन लॉक (Face ID, फ़िंगरप्रिंट, या PIN) सेट है।",
  waGenericGet:
    "आपकी पासकी से साइन इन करते समय कुछ गड़बड़ हुई। जिस डिवाइस पर आपने इसे बनाया था उस पर पुनः प्रयास करें।",
};

const es: Catalog = {
  appTitle: "Trezu",
  appTagline: "Sin contraseña, sin frase semilla — solo tu dispositivo.",
  signUp: "Registrarse",
  signIn: "Iniciar sesión",

  addAccountTitle: "Añadir otra cuenta",
  addAccountSubtitle: "Introduce un usuario o correo para diferenciar tus cuentas",
  usernameOrEmailPlaceholder: "usuario o correo",
  continue: "Continuar",

  registrationFailedTitle: "Error de registro",
  registrationNotRegisteredWarning:
    "Tu passkey se creó pero aún no está registrada. Sin registro no se puede recuperar en otros dispositivos.",
  retry: "Reintentar",
  cancel: "Cancelar",
  close: "Cerrar",
  passkeyNotRegisteredTitle: "Passkey no registrada",

  createPasskeyTitle: "Crea tu passkey",
  createPasskeySubtitle: "Confirma con tu dispositivo cuando te lo pida",
  registeringTitle: "Registrando tu passkey",
  registeringSubtitle: "Publicando su clave pública en NEAR…",
  approveTxTitle: "Aprobar transacción",
  approveTxSubtitle: "Confirma con tu dispositivo para aprobar.",
  approveBtn: "Aprobar",
  signMsgTitle: "Confirmar firma",
  signMsgSubtitle: "Confirma con tu dispositivo para firmar este mensaje.",
  signBtn: "Firmar",
  confirmSignInTitle: "Confirmar inicio de sesión",
  confirmSignInSubtitle: "Confirma con tu dispositivo para iniciar sesión.",
  confirmSignInBtn: "Iniciar sesión",
  confirmSignInAgainSubtitle: "Confirma una vez más con tu dispositivo.",
  lookingUpTitle: "Buscando tu cuenta",
  lookingUpSubtitle: "Resolviendo tu passkey en NEAR…",
  signingInTitle: "Iniciando sesión",
  signingInFinalizeSubtitle: "Finalizando tu cuenta en NEAR…",
  signingInSetupSubtitle: "Configurando tu cuenta en NEAR…",
  usePasskeyTitle: "Usa tu passkey",
  usePasskeySubtitle: "Elige una passkey y confirma con tu dispositivo",

  errOrphan:
    "Tu dispositivo creó una passkey que esta wallet no puede usar. Abre los ajustes de contraseñas / passkeys de tu dispositivo, elimina la passkey que acabas de crear para este sitio e inténtalo de nuevo en otro dispositivo.",
  errNonResident:
    "Tu dispositivo creó una passkey que no se podrá recuperar más adelante (no es una clave residente). Prueba con otro dispositivo o usa tu teléfono para crear la passkey.",
  errNotVerified:
    "Tu dispositivo inició sesión sin verificar tu identidad. Configura Face ID, una huella, un bloqueo de pantalla o un PIN de llave de seguridad e inténtalo de nuevo.",
  errWrongPasskey:
    "Esa era una passkey distinta a la de esta cuenta. Inténtalo de nuevo y elige la passkey de esta cuenta.",
  errNotRegistered:
    "Esta passkey no está registrada en el registro de passkeys (o las claves registradas no coinciden con su firma). Vuelve a crearla en el dispositivo original o regístrala primero.",
  errRegistrationCancelled: "Registro de passkey cancelado: {message}",
  errNotSignedIn: "Sesión no iniciada en la wallet",

  waCancelledCreate:
    "La creación de la passkey se canceló o expiró. Inténtalo de nuevo y confirma con tu dispositivo cuando te lo pida.",
  waCancelledGet:
    "El inicio de sesión se canceló o expiró. Inténtalo de nuevo y confirma con tu dispositivo cuando te lo pida.",
  waDuplicate: "Ya tienes una cuenta en este dispositivo. Elige «Iniciar sesión» para usarla.",
  waNotSupportedCreate:
    "Este dispositivo no puede crear el tipo de passkey que necesita esta wallet. Prueba con otro dispositivo o usa tu teléfono para escanear el código QR de inicio de sesión.",
  waNotSupportedGet:
    "Este dispositivo no puede iniciar sesión con una passkey. Prueba con el dispositivo donde la creaste o usa tu teléfono para escanear el código QR.",
  waConstraintCreate:
    "Tu dispositivo o llave de seguridad necesita un PIN, huella o desbloqueo facial configurado antes de crear esta passkey. Configúralo en los ajustes de tu dispositivo e inténtalo de nuevo.",
  waConstraintGet:
    "Tu llave de seguridad necesita un PIN o tu dispositivo un bloqueo de pantalla para iniciar sesión. Configúralo e inténtalo de nuevo.",
  waSecurity:
    "Este sitio no puede usar passkeys ahora mismo. Asegúrate de estar en el sitio web correcto y de que se cargue mediante una conexión segura (https).",
  waGenericCreate:
    "Algo salió mal al crear tu passkey. Inténtalo de nuevo y asegúrate de tener configurado el bloqueo de pantalla de tu dispositivo (Face ID, huella o PIN).",
  waGenericGet:
    "Algo salió mal al iniciar sesión con tu passkey. Inténtalo de nuevo en el dispositivo donde la creaste.",
};

const fr: Catalog = {
  appTitle: "Trezu",
  appTagline: "Pas de mot de passe, pas de phrase secrète — juste votre appareil.",
  signUp: "S'inscrire",
  signIn: "Se connecter",

  addAccountTitle: "Ajouter un autre compte",
  addAccountSubtitle: "Saisissez un nom d'utilisateur ou un e-mail pour distinguer vos comptes",
  usernameOrEmailPlaceholder: "nom d'utilisateur ou e-mail",
  continue: "Continuer",

  registrationFailedTitle: "Échec de l'enregistrement",
  registrationNotRegisteredWarning:
    "Votre passkey a été créée mais n'est pas encore enregistrée. Sans enregistrement, elle ne peut pas être récupérée sur d'autres appareils.",
  retry: "Réessayer",
  cancel: "Annuler",
  close: "Fermer",
  passkeyNotRegisteredTitle: "Passkey non enregistrée",

  createPasskeyTitle: "Créez votre passkey",
  createPasskeySubtitle: "Confirmez avec votre appareil lorsqu'il le demande",
  registeringTitle: "Enregistrement de votre passkey",
  registeringSubtitle: "Publication de sa clé publique sur NEAR…",
  approveTxTitle: "Approuver la transaction",
  approveTxSubtitle: "Confirmez avec votre appareil pour approuver.",
  approveBtn: "Approuver",
  signMsgTitle: "Confirmer la signature",
  signMsgSubtitle: "Confirmez avec votre appareil pour signer ce message.",
  signBtn: "Signer",
  confirmSignInTitle: "Confirmer la connexion",
  confirmSignInSubtitle: "Confirmez avec votre appareil pour vous connecter.",
  confirmSignInBtn: "Se connecter",
  confirmSignInAgainSubtitle: "Confirmez encore une fois avec votre appareil.",
  lookingUpTitle: "Recherche de votre compte",
  lookingUpSubtitle: "Résolution de votre passkey sur NEAR…",
  signingInTitle: "Connexion en cours",
  signingInFinalizeSubtitle: "Finalisation de votre compte sur NEAR…",
  signingInSetupSubtitle: "Configuration de votre compte sur NEAR…",
  usePasskeyTitle: "Utilisez votre passkey",
  usePasskeySubtitle: "Choisissez une passkey et confirmez avec votre appareil",

  errOrphan:
    "Votre appareil a créé une passkey que ce portefeuille ne peut pas utiliser. Ouvrez les réglages mots de passe / passkeys de votre appareil, supprimez la passkey que vous venez de créer pour ce site, puis réessayez sur un autre appareil.",
  errNonResident:
    "Votre appareil a créé une passkey qui ne pourra pas être récupérée plus tard (ce n'est pas une clé résidente). Essayez un autre appareil ou utilisez votre téléphone pour créer la passkey.",
  errNotVerified:
    "Votre appareil s'est connecté sans vérifier votre identité. Configurez Face ID, une empreinte, un verrouillage d'écran ou un code PIN de clé de sécurité, puis réessayez.",
  errWrongPasskey:
    "Ce n'était pas la passkey de ce compte. Réessayez et choisissez la passkey de ce compte.",
  errNotRegistered:
    "Cette passkey n'est pas enregistrée dans le registre des passkeys (ou les clés enregistrées ne correspondent pas à sa signature). Recréez-la sur l'appareil d'origine ou enregistrez-la d'abord.",
  errRegistrationCancelled: "Enregistrement de la passkey annulé : {message}",
  errNotSignedIn: "Portefeuille non connecté",

  waCancelledCreate:
    "La création de la passkey a été annulée ou a expiré. Réessayez et confirmez avec votre appareil lorsqu'il le demande.",
  waCancelledGet:
    "La connexion a été annulée ou a expiré. Réessayez et confirmez avec votre appareil lorsqu'il le demande.",
  waDuplicate: "Vous avez déjà un compte sur cet appareil. Choisissez « Se connecter » pour l'utiliser.",
  waNotSupportedCreate:
    "Cet appareil ne peut pas créer le type de passkey requis par ce portefeuille. Essayez un autre appareil ou utilisez votre téléphone pour scanner le QR code de connexion.",
  waNotSupportedGet:
    "Cet appareil ne peut pas se connecter avec une passkey. Essayez l'appareil où vous l'avez créée ou utilisez votre téléphone pour scanner le QR code.",
  waConstraintCreate:
    "Votre appareil ou votre clé de sécurité doit avoir un code PIN, une empreinte ou un déverrouillage facial configuré avant de créer cette passkey. Configurez-le dans les réglages de votre appareil et réessayez.",
  waConstraintGet:
    "Votre clé de sécurité a besoin d'un code PIN ou votre appareil d'un verrouillage d'écran pour se connecter. Configurez-le et réessayez.",
  waSecurity:
    "Ce site n'est pas autorisé à utiliser les passkeys pour le moment. Vérifiez que vous êtes sur le bon site et qu'il est chargé via une connexion sécurisée (https).",
  waGenericCreate:
    "Une erreur s'est produite lors de la création de votre passkey. Réessayez et assurez-vous que le verrouillage d'écran de votre appareil (Face ID, empreinte ou PIN) est configuré.",
  waGenericGet:
    "Une erreur s'est produite lors de la connexion avec votre passkey. Réessayez sur l'appareil où vous l'avez créée.",
};

const CATALOGS: Record<Lang, Catalog> = { en, zh, hi, es, fr };

/** Keys any locale is missing relative to English (empty when complete). */
export function missingKeysByLang(): Record<Lang, string[]> {
  const enKeys = Object.keys(en);
  const out = {} as Record<Lang, string[]>;
  for (const l of SUPPORTED_LANGS) {
    out[l] = enKeys.filter((k) => !(k in CATALOGS[l]));
  }
  return out;
}

function detectLang(): Lang {
  // `navigator` is absent under the node test environment — default to English.
  if (typeof navigator === "undefined") return "en";
  const nav = navigator as Navigator & { languages?: readonly string[] };
  const candidates =
    nav.languages && nav.languages.length > 0 ? nav.languages : [nav.language || "en"];
  for (const candidate of candidates) {
    const base = candidate.toLowerCase().split("-")[0] ?? "";
    if ((SUPPORTED_LANGS as readonly string[]).includes(base)) return base as Lang;
  }
  return "en";
}

let current: Lang | null = null;

/** The active language, detected once from `navigator` on first use. */
export function lang(): Lang {
  if (current === null) current = detectLang();
  return current;
}

/** Override the active language (e.g. from a dApp-provided locale). */
export function setLang(next: Lang): void {
  current = next;
}

/**
 * Translate `key` into the active language, filling `{name}` placeholders from
 * `params`. Falls back to English, then to the raw key, so nothing renders
 * empty.
 */
export function t(key: string, params?: Params): string {
  const table = CATALOGS[lang()];
  let text = table[key] ?? en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}
