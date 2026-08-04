import { Link } from "react-router";
import { useElection } from "../../ElectionContext";
import { Icon } from "./Icon";
import { PageTitle } from "./PageTitle";

export function NotFound({ label = "Halaman" }: { label?: string }) {
  const { paths } = useElection();
  return (
    <section className="not-found"><PageTitle title="Tidak ditemui"/>
      <Icon name="search" size={34}/><span className="eyebrow">404</span><h1>{label} tidak ditemui</h1>
      <p>Semak semula alamat atau kembali ke senarai data.</p>
      <Link to={paths.states}>Kembali ke negeri <Icon name="arrow" size={16}/></Link>
    </section>
  );
}
