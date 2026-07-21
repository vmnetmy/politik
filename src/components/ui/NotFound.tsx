import { Link } from "react-router-dom";
import { STATE_BASE } from "../../routes";
import { Icon } from "./Icon";
import { PageTitle } from "./PageTitle";

export function NotFound({ label = "Halaman" }: { label?: string }) {
  return (
    <section className="not-found"><PageTitle title="Tidak ditemui"/>
      <Icon name="search" size={34}/><span className="eyebrow">404</span><h1>{label} tidak ditemui</h1>
      <p>Semak semula alamat atau kembali ke senarai data.</p>
      <Link to={STATE_BASE}>Kembali ke negeri <Icon name="arrow" size={16}/></Link>
    </section>
  );
}
