import { NavLink } from "react-router-dom";
import { useElection } from "../../ElectionContext";

export function VoterDimensionNav() {
  const { edition, paths } = useElection();

  return <nav className="voter-dimension-tabs" aria-label="Dimensi statistik pengundi">
    <NavLink to={paths.voters} end>Ringkasan</NavLink>
    <NavLink to={paths.voterArea}>Kawasan</NavLink>
    {edition.capabilities.voterAge && <NavLink to={paths.voterAge}>Umur</NavLink>}
    {edition.capabilities.voterEthnicity && <NavLink to={paths.voterEthnicity}>Bangsa</NavLink>}
  </nav>;
}
