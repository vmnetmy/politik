import { useEffect, useId, useMemo, useRef, useState } from "react";
import { normalise } from "../../utils";
import { Icon } from "./Icon";

export type SearchComboboxProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  className?: string;
};

export function SearchCombobox({ label, value, options, onChange, placeholder = "Cari atau pilih…", disabled = false, allowCustom = true, className = "" }: SearchComboboxProps) {
  const generatedId = useId();
  const inputId = `combobox-${generatedId.replace(/:/g, "")}`;
  const listId = `${inputId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const uniqueOptions = useMemo(() => [...new Set(options.filter(Boolean))], [options]);
  const filteredOptions = useMemo(() => uniqueOptions.filter((option) => !searchTerm || normalise(option).includes(normalise(searchTerm))).slice(0, 60), [uniqueOptions, searchTerm]);

  useEffect(() => setQuery(value), [value]);
  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery(value);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [value]);

  const choose = (option: string) => {
    onChange(option);
    setQuery(option);
    setSearchTerm("");
    setOpen(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, Math.max(0, filteredOptions.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter" && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery(value);
      setSearchTerm("");
    }
  };

  return (
    <div className={`search-combobox ${className}`} ref={rootRef}>
      <label htmlFor={inputId}>{label}</label>
      <div className={`combobox-control ${open ? "is-open" : ""}`}>
        <Icon name="search" size={16}/>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && filteredOptions[activeIndex] ? `${inputId}-option-${activeIndex}` : undefined}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={(event) => { setOpen(true); setSearchTerm(""); setActiveIndex(Math.max(0, uniqueOptions.indexOf(value))); event.currentTarget.select(); }}
          onChange={(event) => { const next = event.target.value; setQuery(next); setSearchTerm(next); setActiveIndex(0); setOpen(true); if (allowCustom) onChange(next); }}
          onKeyDown={onKeyDown}
        />
        <button type="button" disabled={disabled} aria-label={`${open ? "Tutup" : "Buka"} pilihan ${label}`} onClick={() => { setOpen((current) => !current); setSearchTerm(""); inputRef.current?.focus(); }}><Icon name="chevron" size={16}/></button>
      </div>
      {open && !disabled && <div className="combobox-menu" id={listId} role="listbox">{filteredOptions.length ? filteredOptions.map((option, index) => <button type="button" role="option" id={`${inputId}-option-${index}`} aria-selected={option === value} className={`combobox-option ${index === activeIndex ? "is-active" : ""}`} key={option} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(option)}><span>{option}</span>{option === value && <b>Dipilih</b>}</button>) : <div className="combobox-empty">Tiada pilihan ditemui{allowCustom && query ? ". Nilai baharu boleh digunakan." : "."}</div>}</div>}
    </div>
  );
}
