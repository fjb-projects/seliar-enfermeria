import { Input } from "@/components/ui/input";

const staffDirectoryKeys = [
  "registrationNumber",
  "employmentStatus",
  "jobRole",
  "region",
  "contactPhone",
  "workplace",
  "operationalStatus",
  "operationalRole",
] as const;

type StaffDirectoryKey = (typeof staffDirectoryKeys)[number];
type StaffDirectoryValues = Partial<Record<StaffDirectoryKey, string | null>>;

const directoryFields: { key: StaffDirectoryKey; label: string }[] = [
  { key: "registrationNumber", label: "Matrícula" },
  { key: "employmentStatus", label: "Situación de revista" },
  { key: "jobRole", label: "Función laboral" },
  { key: "region", label: "Región" },
  { key: "contactPhone", label: "Teléfono de contacto" },
  { key: "workplace", label: "Lugar de desempeño" },
  { key: "operationalStatus", label: "Condición operativa" },
  { key: "operationalRole", label: "Función operativa" },
];

export function StaffDirectoryFields({
  prefix,
  values,
}: {
  prefix: string;
  values?: StaffDirectoryValues;
}) {
  return (
    <details className="rounded-md border p-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">
        Datos laborales y contacto
      </summary>
      <fieldset className="mt-3 grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Datos laborales y contacto</legend>
        {values?.registrationNumber?.toLocaleUpperCase("es").includes("L") && (
          <p className="sm:col-span-2 text-sm font-medium" aria-label="Calificación profesional">
            Licenciatura indicada por la matrícula
          </p>
        )}
        {directoryFields.map(({ key, label }) => {
          const id = `${prefix}-${key}`;
          return (
            <div className="space-y-1.5" key={key}>
              <label htmlFor={id} className="text-sm font-medium">
                {label}
              </label>
              <Input
                id={id}
                name={`${prefix}${key.charAt(0).toUpperCase()}${key.slice(1)}`}
                className="min-h-11"
                defaultValue={values?.[key] ?? ""}
                maxLength={300}
              />
            </div>
          );
        })}
      </fieldset>
    </details>
  );
}
