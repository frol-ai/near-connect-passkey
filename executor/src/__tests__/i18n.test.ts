import { afterEach, describe, expect, it } from "vitest";

import { missingKeysByLang, setLang, t } from "../i18n";

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

  it("every language defines the full English key set (no gaps)", () => {
    expect(missingKeysByLang()).toEqual({ en: [], zh: [], hi: [], es: [], fr: [] });
  });
});
