import { afterEach, describe, expect, it } from "vitest";

import { SUPPORTED_LANGS, dir, isRtl, missingKeysByLang, setLang, t } from "../i18n";

afterEach(() => setLang("en"));

describe("i18n", () => {
  it("defaults to English under the node test environment", () => {
    expect(t("signUp")).toBe("Sign up");
    expect(t("signIn")).toBe("Sign in");
  });

  it("switches language via setLang", () => {
    setLang("es");
    expect(t("signIn")).toBe("Iniciar sesión");
    setLang("fr");
    expect(t("signIn")).toBe("Se connecter");
    setLang("zh");
    expect(t("signIn")).toBe("登录");
    setLang("hi");
    expect(t("signIn")).toBe("साइन इन करें");
    setLang("ru");
    expect(t("signIn")).toBe("Войти");
    setLang("uk");
    expect(t("signIn")).toBe("Увійти");
    setLang("ko");
    expect(t("signIn")).toBe("로그인");
  });

  it("fills placeholders", () => {
    setLang("en");
    expect(t("errRegistrationCancelled", { message: "boom" })).toBe(
      "Passkey registration cancelled: boom",
    );
  });

  it("falls back to the raw key for an unknown key", () => {
    expect(t("no_such_key_zzz")).toBe("no_such_key_zzz");
  });

  it("every supported language defines the full English key set (no gaps)", () => {
    const missing = missingKeysByLang();
    for (const l of SUPPORTED_LANGS) {
      expect(missing[l], `missing keys in "${l}"`).toEqual([]);
    }
  });

  it("marks RTL languages and sets the direction", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("fa")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl("ru")).toBe(false);
    setLang("ar");
    expect(dir()).toBe("rtl");
    setLang("en");
    expect(dir()).toBe("ltr");
  });
});
