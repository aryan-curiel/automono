import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Label, Select, TextArea, TextInput } from "../components/ui/Field";
import { BackLink } from "../components/PageHeader";
import { createClient, getClient, updateClient } from "../db/clients";
import type { ClientRecord, InvoiceLanguage, NewClient, VatTreatment } from "../db/clients";
import { isValidInvoicePrefix, isValidNifCif, isValidVatNumber, suggestVatTreatment } from "../features/clients";
import { COUNTRY_CODES, countryName } from "../lib/countries";

interface ClienteFormProps {
  mode: "create" | "edit";
  clientId?: number;
  onSaved: (client: ClientRecord) => void;
  onCancel: () => void;
}

interface FormState {
  name: string;
  nifCif: string;
  vatNumber: string;
  address: string;
  email: string;
  phone: string;
  notes: string;
  invoicePrefix: string;
  vatTreatment: VatTreatment;
  invoiceLanguage: InvoiceLanguage;
  country: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  nifCif: "",
  vatNumber: "",
  address: "",
  email: "",
  phone: "",
  notes: "",
  invoicePrefix: "",
  vatTreatment: "standard",
  invoiceLanguage: "es",
  country: "",
};

function toFormState(client: ClientRecord): FormState {
  return {
    name: client.name,
    nifCif: client.nifCif,
    vatNumber: client.vatNumber ?? "",
    address: client.address ?? "",
    email: client.email ?? "",
    phone: client.phone ?? "",
    notes: client.notes ?? "",
    invoicePrefix: client.invoicePrefix,
    vatTreatment: client.vatTreatment,
    invoiceLanguage: client.invoiceLanguage,
    country: client.country ?? "",
  };
}

type FieldErrors = Partial<Record<"name" | "nifCif" | "vatNumber" | "invoicePrefix", string>>;

export function ClienteForm({ mode, clientId, onSaved, onCancel }: ClienteFormProps) {
  const { t, i18n } = useTranslation();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [vatNumberEdited, setVatNumberEdited] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || clientId === undefined) return;
    let cancelled = false;
    getClient(clientId)
      .then((client) => {
        if (cancelled) return;
        if (client) {
          setForm(toFormState(client));
          setVatNumberEdited(!!(client.vatNumber ?? "").trim());
        }
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, clientId]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function setCountry(country: string) {
    setForm((f) => ({
      ...f,
      country,
      vatTreatment: suggestVatTreatment(country || null),
      vatNumber: !vatNumberEdited && country ? `${country}${f.nifCif.toUpperCase()}` : f.vatNumber,
    }));
  }

  function handleNifCifChange(value: string) {
    setForm((f) => ({
      ...f,
      nifCif: value,
      vatNumber: !vatNumberEdited && f.country ? `${f.country}${value.toUpperCase()}` : f.vatNumber,
    }));
  }

  function handleVatNumberChange(value: string) {
    setVatNumberEdited(true);
    set("vatNumber", value);
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (!form.name.trim()) next.name = t("clients.errors.nameRequired");
    if (!isValidNifCif(form.nifCif)) next.nifCif = t("clients.errors.nifCifInvalid");
    if (!isValidVatNumber(form.vatNumber)) next.vatNumber = t("clients.errors.vatNumberInvalid");
    if (!isValidInvoicePrefix(form.invoicePrefix))
      next.invoicePrefix = t("clients.errors.invoicePrefixFormat");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    setSaveError(null);
    if (!validate()) return;

    const payload: NewClient = {
      name: form.name.trim(),
      nifCif: form.nifCif.trim().toUpperCase(),
      vatNumber: form.vatNumber.trim().toUpperCase() || null,
      address: form.address.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      notes: form.notes.trim() || null,
      invoicePrefix: form.invoicePrefix.trim().toUpperCase(),
      vatTreatment: form.vatTreatment,
      invoiceLanguage: form.invoiceLanguage,
      country: form.country || null,
    };

    setSaving(true);
    try {
      if (mode === "create") {
        const created = await createClient(payload);
        onSaved(created);
      } else {
        await updateClient(clientId!, payload);
        const updated = await getClient(clientId!);
        if (updated) onSaved(updated);
      }
    } catch (err) {
      if (String(err).includes("UNIQUE") && String(err).includes("invoice_prefix")) {
        setErrors((e) => ({ ...e, invoicePrefix: t("clients.errors.invoicePrefixTaken") }));
      } else {
        setSaveError(t("clients.errors.saveFailed"));
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-ink-soft">{t("clients.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="px-10 pt-8 pb-15">
        <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
      </div>
    );
  }

  return (
    <div className="px-10 pt-8 pb-15">
      <BackLink label={t("clients.title")} onClick={onCancel} />
      <h1 className="font-extrabold text-2xl tracking-tight m-0 mb-5.5">
        {mode === "create" ? t("clients.newClient") : t("clients.editClient")}
      </h1>

      <Card className="p-5.5 max-w-[640px]">
        <div className="mb-3.5">
          <Label>{t("clients.fields.name")}</Label>
          <TextInput
            value={form.name}
            error={!!errors.name}
            onChange={(e) => set("name", e.target.value)}
          />
          {errors.name && <ErrorText>{errors.name}</ErrorText>}
        </div>

        <div className="grid grid-cols-3 gap-3.5 mb-3.5">
          <div>
            <Label>{t("clients.fields.nifCif")}</Label>
            <TextInput
              mono
              value={form.nifCif}
              error={!!errors.nifCif}
              onChange={(e) => handleNifCifChange(e.target.value)}
            />
            {errors.nifCif && <ErrorText>{errors.nifCif}</ErrorText>}
          </div>
          <div>
            <Label>{t("clients.fields.vatNumber")}</Label>
            <TextInput
              mono
              value={form.vatNumber}
              error={!!errors.vatNumber}
              onChange={(e) => handleVatNumberChange(e.target.value)}
            />
            {errors.vatNumber && <ErrorText>{errors.vatNumber}</ErrorText>}
          </div>
          <div>
            <Label>{t("clients.fields.invoicePrefix")}</Label>
            <TextInput
              mono
              value={form.invoicePrefix}
              error={!!errors.invoicePrefix}
              onChange={(e) => set("invoicePrefix", e.target.value)}
            />
            {errors.invoicePrefix && <ErrorText>{errors.invoicePrefix}</ErrorText>}
          </div>
        </div>

        <div className="mb-3.5">
          <Label>{t("clients.fields.address")}</Label>
          <TextInput value={form.address} onChange={(e) => set("address", e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3.5 mb-3.5">
          <div>
            <Label>{t("clients.fields.email")}</Label>
            <TextInput
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div>
            <Label>{t("clients.fields.phone")}</Label>
            <TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3.5 mb-3.5">
          <div>
            <Label>{t("clients.fields.country")}</Label>
            <Select value={form.country} onChange={(e) => setCountry(e.target.value)}>
              <option value="">{t("clients.fields.countryUnset")}</option>
              {COUNTRY_CODES.map((code) => (
                <option key={code} value={code}>
                  {countryName(code, i18n.language)}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t("clients.fields.vatTreatment")}</Label>
            <Select
              value={form.vatTreatment}
              onChange={(e) => set("vatTreatment", e.target.value as VatTreatment)}
            >
              <option value="standard">{t("clients.vatTreatment.standard")}</option>
              <option value="reverse_charge_eu">
                {t("clients.vatTreatment.reverse_charge_eu")}
              </option>
              <option value="export_outside_eu">
                {t("clients.vatTreatment.export_outside_eu")}
              </option>
              <option value="exempt_other">{t("clients.vatTreatment.exempt_other")}</option>
            </Select>
          </div>
          <div>
            <Label>{t("clients.fields.invoiceLanguage")}</Label>
            <Select
              value={form.invoiceLanguage}
              onChange={(e) => set("invoiceLanguage", e.target.value as InvoiceLanguage)}
            >
              <option value="es">{t("clients.invoiceLanguage.es")}</option>
              <option value="en">{t("clients.invoiceLanguage.en")}</option>
              <option value="ca">{t("clients.invoiceLanguage.ca")}</option>
            </Select>
          </div>
        </div>

        <div className="mb-4.5">
          <Label>{t("clients.fields.notes")}</Label>
          <TextArea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </div>

        {saveError && <ErrorText>{saveError}</ErrorText>}

        <div className="flex gap-2.5 mt-4.5">
          <Button onClick={handleSubmit} disabled={saving}>
            {t("clients.actions.save")}
          </Button>
          <Button variant="secondary" onClick={onCancel} disabled={saving}>
            {t("clients.actions.cancel")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
