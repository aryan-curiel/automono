import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { ErrorText, Select, TextArea, TextInput } from "../components/ui/Field";
import { FormRow } from "../components/ui/FormRow";
import { PageHeader } from "../components/PageHeader";
import { createClient, getClient, updateClient } from "../db/clients";
import type { ClientRecord, InvoiceLanguage, NewClient, VatTreatment } from "../db/clients";
import { listSeries } from "../db/series";
import type { SeriesRecord } from "../db/series";
import {
  isValidInvoicePrefix,
  isValidNifCif,
  isValidVatNumber,
  suggestVatTreatment,
} from "../features/clients";
import { COUNTRY_CODES, countryName } from "../lib/countries";

const NEW_SERIES = "__new__";

interface ClienteFormProps {
  mode: "create" | "edit";
  clientId?: number;
  onSaved: (client: ClientRecord) => void;
  onCancel: () => void;
  /** Rendered inside a Sheet by App — drop the page chrome (header + page padding). */
  embedded?: boolean;
}

interface FormState {
  name: string;
  nifCif: string;
  vatNumber: string;
  address: string;
  email: string;
  phone: string;
  notes: string;
  seriesChoice: string;
  newSeriesPrefix: string;
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
  seriesChoice: NEW_SERIES,
  newSeriesPrefix: "",
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
    seriesChoice: String(client.seriesId),
    newSeriesPrefix: "",
    vatTreatment: client.vatTreatment,
    invoiceLanguage: client.invoiceLanguage,
    country: client.country ?? "",
  };
}

type FieldErrors = Partial<Record<"name" | "nifCif" | "vatNumber" | "invoicePrefix", string>>;

export function ClienteForm({ mode, clientId, onSaved, onCancel, embedded }: ClienteFormProps) {
  const { t, i18n } = useTranslation();
  const pad = embedded ? "" : "px-8 pb-15";
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(mode === "edit");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [vatNumberEdited, setVatNumberEdited] = useState(false);
  const [vatTreatmentEdited, setVatTreatmentEdited] = useState(false);
  const [seriesList, setSeriesList] = useState<SeriesRecord[]>([]);

  useEffect(() => {
    listSeries()
      .then(setSeriesList)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode !== "edit" || clientId === undefined) return;
    let cancelled = false;
    getClient(clientId)
      .then((client) => {
        if (cancelled) return;
        if (client) {
          setForm(toFormState(client));
          setVatNumberEdited(!!(client.vatNumber ?? "").trim());
          setVatTreatmentEdited(true);
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
      vatTreatment: vatTreatmentEdited ? f.vatTreatment : suggestVatTreatment(country || null),
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
    if (form.seriesChoice === NEW_SERIES && !isValidInvoicePrefix(form.newSeriesPrefix))
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
      series:
        form.seriesChoice === NEW_SERIES
          ? { newPrefix: form.newSeriesPrefix.trim().toUpperCase() }
          : { id: Number(form.seriesChoice) },
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
      if (String(err).includes("UNIQUE") && String(err).includes("invoice_series")) {
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
      <div className={pad}>
        <div className="text-sm text-ink-soft">{t("clients.loading")}</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={pad}>
        <div className="text-sm text-danger">{t("clients.errors.loadFailed")}</div>
      </div>
    );
  }

  return (
    <div className={pad}>
      {!embedded && (
        <PageHeader
          title={mode === "create" ? t("clients.newClient") : t("clients.editClient")}
          backLabel={t("clients.title")}
          onBack={onCancel}
        />
      )}

      <Card className="px-5 max-w-[640px]">
        <FormRow label={t("clients.fields.name")} error={errors.name}>
          <TextInput
            value={form.name}
            error={!!errors.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("clients.fields.nifCif")} error={errors.nifCif}>
          <TextInput
            mono
            value={form.nifCif}
            error={!!errors.nifCif}
            onChange={(e) => handleNifCifChange(e.target.value)}
          />
        </FormRow>

        <FormRow label={t("clients.fields.vatNumber")} error={errors.vatNumber}>
          <TextInput
            mono
            value={form.vatNumber}
            error={!!errors.vatNumber}
            onChange={(e) => handleVatNumberChange(e.target.value)}
          />
        </FormRow>

        <FormRow label={t("clients.fields.invoicePrefix")}>
          <Select value={form.seriesChoice} onChange={(e) => set("seriesChoice", e.target.value)}>
            <option value={NEW_SERIES}>{t("clients.fields.newSeriesOption")}</option>
            {seriesList.map((series) => (
              <option key={series.id} value={String(series.id)}>
                {series.prefix}
              </option>
            ))}
          </Select>
        </FormRow>

        {form.seriesChoice === NEW_SERIES && (
          <FormRow label={t("clients.fields.newSeriesPrefix")} error={errors.invoicePrefix}>
            <TextInput
              mono
              value={form.newSeriesPrefix}
              error={!!errors.invoicePrefix}
              onChange={(e) => set("newSeriesPrefix", e.target.value)}
            />
          </FormRow>
        )}

        <FormRow label={t("clients.fields.address")}>
          <TextInput value={form.address} onChange={(e) => set("address", e.target.value)} />
        </FormRow>

        <FormRow label={t("clients.fields.email")}>
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
          />
        </FormRow>

        <FormRow label={t("clients.fields.phone")}>
          <TextInput value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </FormRow>

        <FormRow label={t("clients.fields.country")}>
          <Select value={form.country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">{t("clients.fields.countryUnset")}</option>
            {COUNTRY_CODES.map((code) => (
              <option key={code} value={code}>
                {countryName(code, i18n.language)}
              </option>
            ))}
          </Select>
        </FormRow>

        <FormRow label={t("clients.fields.vatTreatment")}>
          <Select
            value={form.vatTreatment}
            onChange={(e) => {
              setVatTreatmentEdited(true);
              set("vatTreatment", e.target.value as VatTreatment);
            }}
          >
            <option value="standard">{t("clients.vatTreatment.standard")}</option>
            <option value="reverse_charge_eu">{t("clients.vatTreatment.reverse_charge_eu")}</option>
            <option value="export_outside_eu">{t("clients.vatTreatment.export_outside_eu")}</option>
            <option value="exempt_other">{t("clients.vatTreatment.exempt_other")}</option>
          </Select>
        </FormRow>

        <FormRow label={t("clients.fields.invoiceLanguage")}>
          <Select
            value={form.invoiceLanguage}
            onChange={(e) => set("invoiceLanguage", e.target.value as InvoiceLanguage)}
          >
            <option value="es">{t("clients.invoiceLanguage.es")}</option>
            <option value="en">{t("clients.invoiceLanguage.en")}</option>
            <option value="ca">{t("clients.invoiceLanguage.ca")}</option>
          </Select>
        </FormRow>

        <FormRow label={t("clients.fields.notes")}>
          <TextArea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </FormRow>
      </Card>

      {saveError && <ErrorText>{saveError}</ErrorText>}
      <div className="flex gap-2.5 justify-end mt-5">
        <Button variant="secondary" onClick={onCancel} disabled={saving}>
          {t("clients.actions.cancel")}
        </Button>
        <Button onClick={() => void handleSubmit()} disabled={saving}>
          {saving ? t("clients.actions.saving") : t("clients.actions.save")}
        </Button>
      </div>
    </div>
  );
}
