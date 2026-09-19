"use client";

import { useState } from "react";
import DatePicker, { registerLocale } from "react-datepicker";
import { fr } from "date-fns/locale/fr";
import { format, parse } from "date-fns";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("fr", fr);

const VALUE_FORMAT = "yyyy-MM-dd'T'HH:mm";

export function DateTimePicker({
  name,
  defaultValue,
  minDate
}: {
  name: string;
  defaultValue?: string;
  minDate?: Date;
}) {
  const [selected, setSelected] = useState<Date | null>(
    defaultValue ? parse(defaultValue, VALUE_FORMAT, new Date()) : null
  );

  return (
    <>
      <DatePicker
        selected={selected}
        onChange={(date: Date | null) => setSelected(date)}
        locale="fr"
        showTimeSelect
        timeFormat="HH:mm"
        timeIntervals={15}
        timeCaption="Heure"
        dateFormat="dd/MM/yyyy HH:mm"
        minDate={minDate}
        placeholderText="jj/mm/aaaa hh:mm"
        previousMonthButtonLabel="Mois précédent"
        nextMonthButtonLabel="Mois suivant"
        wrapperClassName="w-full"
        className="h-10 w-full rounded-md border border-input bg-white px-3 text-sm text-foreground dark:bg-card"
      />
      <input type="hidden" name={name} value={selected ? format(selected, VALUE_FORMAT) : ""} />
    </>
  );
}
