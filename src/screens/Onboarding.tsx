import { useState } from "react";
import { useTranslation } from "react-i18next";
import * as Switch from "@radix-ui/react-switch";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Buildings, Bank, FileArrowUp, SlidersHorizontal } from "@phosphor-icons/react";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { SegmentedControl } from "../components/ui/SegmentedControl";
import { BusinessDocumentsPanel } from "../components/BusinessDocumentsPanel";
import { mergeRegistrationFields } from "../db/businessDocuments";
import type { RegistrationFields } from "../db/businessDocuments";
import { attachBusinessLogo, pickBusinessLogo, updateBusinessProfile } from "../db/businessProfile";
import type { BusinessProfileRecord } from "../db/businessProfile";
import { updatePreferences } from "../db/preferences";
import type { PreferencesRecord } from "../db/preferences";
import {
  defaultIrpfRate,
  IRPF_REDUCED_RATE,
  isValidNifCif,
  isValidVatNumber,
} from "../features/clients";
import { isValidIban } from "../features/settings";
import { EXIT_SPRING } from "../lib/motion";

interface OnboardingProps {
  initialPreferences: PreferencesRecord;
  onComplete: (preferences: PreferencesRecord) => void;
}

const EMPTY_BUSINESS: BusinessProfileRecord = {
  name: "",
  nifCif: "",
  vatNumber: "",
  address: "",
  bankName: "",
  iban: "",
  bic: "",
  logoPath: null,
};

type Step = 1 | 2 | 3 | 4;
type StepOneErrors = Partial<Record<"name" | "nifCif" | "vatNumber", string>>;

const STEP_ICON = { 1: FileArrowUp, 2: Buildings, 3: Bank, 4: SlidersHorizontal };

type StepVariantCustom = { direction: number; reduceMotion: boolean };

const stepVariants = {
  enter: ({ direction }: StepVariantCustom) => ({ opacity: 0, x: direction * 24 }),
  center: { opacity: 1, x: 0 },
  exit: ({ direction, reduceMotion }: StepVariantCustom) => ({
    opacity: 0,
    x: direction * -24,
    transition: reduceMotion ? { duration: 0 } : EXIT_SPRING,
  }),
};

export function Onboarding({ initialPreferences, onComplete }: OnboardingProps) {
  const { i18n } = useTranslation();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<Step>(1);
  const [direction, setDirection] = useState(1);
  const [business, setBusiness] = useState<BusinessProfileRecord>(EMPTY_BUSINESS);
  const [vatNumberEdited, setVatNumberEdited] = useState(false);
  const [prefs, setPrefs] = useState<PreferencesRecord>(initialPreferences);
  const [stepOneErrors, setStepOneErrors] = useState<StepOneErrors>({});
  const [ibanError, setIbanError] = useState<string>();
  const [logoUploading, setLogoUploading] = useState(false);
  const [finishing, setFinishing] = useState(false);

  function goTo(next: Step) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  function set<K extends keyof BusinessProfileRecord>(key: K, value: BusinessProfileRecord[K]) {
    setBusiness((b) => ({ ...b, [key]: value }));
  }

  function handleNifChange(value: string) {
    setBusiness((b) => ({
      ...b,
      nifCif: value,
      vatNumber: vatNumberEdited ? b.vatNumber : `ES${value.toUpperCase()}`,
    }));
  }

  async function saveBusiness() {
    await updateBusinessProfile({
      name: business.name.trim(),
      nifCif: business.nifCif.trim().toUpperCase(),
      vatNumber: business.vatNumber.trim().toUpperCase(),
      address: business.address.trim(),
      bankName: business.bankName.trim(),
      iban: business.iban.trim().toUpperCase(),
      bic: business.bic.trim().toUpperCase(),
      logoPath: business.logoPath,
    });
  }

  async function skip() {
    setFinishing(true);
    try {
      await saveBusiness();
      await updatePreferences({ onboardingCompleted: true });
      onComplete({ ...prefs, onboardingCompleted: true });
    } finally {
      setFinishing(false);
    }
  }

  function continueFromStepOne() {
    const errors: StepOneErrors = {};
    if (!business.name.trim()) errors.name = "El nombre es obligatorio";
    if (business.nifCif.trim() && !isValidNifCif(business.nifCif))
      errors.nifCif = "NIF/CIF con formato inválido";
    if (business.vatNumber.trim() && !isValidVatNumber(business.vatNumber))
      errors.vatNumber = "Número de IVA con formato inválido";
    setStepOneErrors(errors);
    if (Object.keys(errors).length === 0) goTo(3);
  }

  function continueFromStepTwo() {
    if (business.iban.trim() && !isValidIban(business.iban)) {
      setIbanError("IBAN con formato o dígitos de control inválidos");
      return;
    }
    setIbanError(undefined);
    goTo(4);
  }

  /** Merges extracted fields into the still-unsaved local state — nothing is written to
   * SQLite here, so the following steps simply render pre-filled and remain editable before
   * the user hits "Continuar"/"Finalizar". Only fills fields still blank (e.g. from an earlier
   * upload or manual typing), never replaces one already filled in. */
  function applyExtracted(fields: RegistrationFields) {
    setBusiness((b) => mergeRegistrationFields(b, fields));
    setPrefs((p) => {
      const retaStartDate = fields.retaStartDate ?? p.retaStartDate;
      return {
        ...p,
        retaStartDate,
        // Re-derive the IRPF default from the (newly extracted) alta date, unless the user already
        // changed it away from the reduced rate by hand.
        defaultIrpfRate:
          p.defaultIrpfRate === IRPF_REDUCED_RATE
            ? defaultIrpfRate(retaStartDate)
            : p.defaultIrpfRate,
      };
    });
  }

  async function handlePickLogo() {
    const source = await pickBusinessLogo();
    if (!source) return;
    setLogoUploading(true);
    try {
      const stored = await attachBusinessLogo(source);
      set("logoPath", stored);
    } finally {
      setLogoUploading(false);
    }
  }

  function handleLanguageChange(language: "es" | "en") {
    setPrefs((p) => ({ ...p, language }));
    void i18n.changeLanguage(language);
  }

  async function finish() {
    setFinishing(true);
    try {
      await saveBusiness();
      const finalPrefs: PreferencesRecord = { ...prefs, onboardingCompleted: true };
      await updatePreferences(finalPrefs);
      onComplete(finalPrefs);
    } finally {
      setFinishing(false);
    }
  }

  const StepIcon = STEP_ICON[step];
  const entranceTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 380, damping: 32 } as const);
  const slideTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 380, damping: 34 } as const);
  const progressTransition = reduceMotion
    ? { duration: 0 }
    : ({ type: "spring", stiffness: 300, damping: 30 } as const);

  return (
    <div className="flex h-screen items-center justify-center bg-bg text-ink px-6">
      <motion.div
        initial={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={entranceTransition}
        className="w-full max-w-[560px]"
      >
        <Card className="px-6 py-6 overflow-hidden">
          <div className="h-1.5 rounded-pill bg-surface-alt mb-5 overflow-hidden">
            <motion.div
              className="h-full rounded-pill bg-accent"
              initial={false}
              animate={{ width: `${(step / 4) * 100}%` }}
              transition={progressTransition}
            />
          </div>

          <AnimatePresence mode="wait" custom={{ direction, reduceMotion }} initial={false}>
            <motion.div
              key={step}
              custom={{ direction, reduceMotion }}
              variants={stepVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={slideTransition}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <StepIcon size={18} weight="bold" className="text-accent" />
                <div className="font-bold text-[17px]">
                  {step === 1 && "Documentos de alta"}
                  {step === 2 && "Bienvenido a AutoMono"}
                  {step === 3 && "Cuenta bancaria"}
                  {step === 4 && "Preferencias"}
                </div>
              </div>

              {step === 1 && (
                <div>
                  <div className="text-[13px] text-ink-soft mb-4">
                    Sube tus documentos de alta como autónomo (censal, RETA, IAE…) y rellenaremos
                    los siguientes pasos por ti.
                  </div>
                  <BusinessDocumentsPanel onExtracted={applyExtracted} showContext={false} />
                  <div className="flex items-center justify-between mt-5">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void skip()}
                      disabled={finishing}
                    >
                      Saltar por ahora
                    </Button>
                    <Button type="button" onClick={() => goTo(2)}>
                      Continuar
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    continueFromStepOne();
                  }}
                >
                  <div className="text-[13px] text-ink-soft mb-4">
                    Empecemos con los datos de tu negocio.
                  </div>
                  <FormRow label="Nombre / Razón social" error={stepOneErrors.name}>
                    <TextInput
                      value={business.name}
                      error={!!stepOneErrors.name}
                      onChange={(e) => {
                        set("name", e.target.value);
                        setStepOneErrors((err) => ({ ...err, name: undefined }));
                      }}
                    />
                  </FormRow>
                  <FormRow label="NIF" error={stepOneErrors.nifCif}>
                    <TextInput
                      mono
                      value={business.nifCif}
                      error={!!stepOneErrors.nifCif}
                      onChange={(e) => {
                        handleNifChange(e.target.value);
                        setStepOneErrors((err) => ({ ...err, nifCif: undefined }));
                      }}
                    />
                  </FormRow>
                  <FormRow label="Número de IVA" error={stepOneErrors.vatNumber}>
                    <TextInput
                      mono
                      value={business.vatNumber}
                      error={!!stepOneErrors.vatNumber}
                      onChange={(e) => {
                        setVatNumberEdited(true);
                        set("vatNumber", e.target.value);
                        setStepOneErrors((err) => ({ ...err, vatNumber: undefined }));
                      }}
                    />
                  </FormRow>
                  <FormRow label="Dirección fiscal">
                    <TextInput
                      value={business.address}
                      onChange={(e) => set("address", e.target.value)}
                    />
                  </FormRow>
                  <FormRow label="Logo">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void handlePickLogo()}
                      disabled={logoUploading}
                    >
                      {logoUploading
                        ? "Subiendo…"
                        : business.logoPath
                          ? "Cambiar logo"
                          : "Subir logo"}
                    </Button>
                  </FormRow>

                  <div className="flex items-center justify-between mt-5">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void skip()}
                      disabled={finishing}
                    >
                      Saltar por ahora
                    </Button>
                    <div className="flex gap-2.5">
                      <Button type="button" variant="secondary" onClick={() => goTo(1)}>
                        Atrás
                      </Button>
                      <Button type="submit">Continuar</Button>
                    </div>
                  </div>
                </form>
              )}

              {step === 3 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    continueFromStepTwo();
                  }}
                >
                  <div className="text-[13px] text-ink-soft mb-4">
                    Se usará para mostrar los datos de pago en tus facturas.
                  </div>
                  <FormRow label="Nombre del banco">
                    <TextInput
                      value={business.bankName}
                      onChange={(e) => set("bankName", e.target.value)}
                    />
                  </FormRow>
                  <FormRow label="IBAN" error={ibanError}>
                    <TextInput
                      mono
                      value={business.iban}
                      error={!!ibanError}
                      onChange={(e) => {
                        set("iban", e.target.value);
                        setIbanError(undefined);
                      }}
                    />
                  </FormRow>
                  <FormRow label="BIC / SWIFT">
                    <TextInput
                      mono
                      value={business.bic}
                      onChange={(e) => set("bic", e.target.value)}
                    />
                  </FormRow>

                  <div className="flex items-center justify-between mt-5">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void skip()}
                      disabled={finishing}
                    >
                      Saltar por ahora
                    </Button>
                    <div className="flex gap-2.5">
                      <Button type="button" variant="secondary" onClick={() => goTo(2)}>
                        Atrás
                      </Button>
                      <Button type="submit">Continuar</Button>
                    </div>
                  </div>
                </form>
              )}

              {step === 4 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void finish();
                  }}
                >
                  <div className="text-[13px] text-ink-soft mb-4">
                    Puedes cambiar esto más adelante en Ajustes.
                  </div>
                  <FormRow label="Modo oscuro">
                    <div className="flex items-center gap-2.5">
                      <Switch.Root
                        type="button"
                        checked={prefs.theme === "dark"}
                        onCheckedChange={(checked) =>
                          setPrefs((p) => ({ ...p, theme: checked ? "dark" : "light" }))
                        }
                        className="w-9 h-5 rounded-pill relative bg-surface-alt border border-border data-[state=checked]:bg-accent data-[state=checked]:border-accent transition-colors ease-[var(--ease-out)] outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
                      >
                        <Switch.Thumb className="block w-4 h-4 rounded-pill bg-white translate-x-0.5 transition-transform ease-[var(--ease-out)] data-[state=checked]:translate-x-[18px]" />
                      </Switch.Root>
                      <span className="text-[13px] text-ink-soft">
                        {prefs.theme === "dark" ? "Activado" : "Desactivado"}
                      </span>
                    </div>
                  </FormRow>
                  <FormRow label="Idioma">
                    <SegmentedControl
                      options={[
                        { value: "es", label: "Español" },
                        { value: "en", label: "English" },
                      ]}
                      value={prefs.language}
                      onChange={handleLanguageChange}
                    />
                  </FormRow>
                  <FormRow label="IVA por defecto (%)">
                    <TextInput
                      type="number"
                      min={0}
                      value={prefs.defaultIvaRate}
                      onChange={(e) =>
                        setPrefs((p) => ({ ...p, defaultIvaRate: Number(e.target.value) || 0 }))
                      }
                    />
                  </FormRow>
                  <FormRow label="IRPF por defecto (%)">
                    <TextInput
                      type="number"
                      min={0}
                      value={prefs.defaultIrpfRate}
                      onChange={(e) =>
                        setPrefs((p) => ({ ...p, defaultIrpfRate: Number(e.target.value) || 0 }))
                      }
                    />
                  </FormRow>

                  <div className="flex items-center justify-between mt-5">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void skip()}
                      disabled={finishing}
                    >
                      Saltar por ahora
                    </Button>
                    <div className="flex gap-2.5">
                      <Button type="button" variant="secondary" onClick={() => goTo(3)}>
                        Atrás
                      </Button>
                      <Button type="submit" disabled={finishing}>
                        {finishing ? "Guardando…" : "Finalizar"}
                      </Button>
                    </div>
                  </div>
                </form>
              )}
            </motion.div>
          </AnimatePresence>
        </Card>
      </motion.div>
    </div>
  );
}
