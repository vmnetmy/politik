import { Link } from "react-router";
import { motion, MotionConfig } from "motion/react";
import { stateElectionMapPath, stateElectionPath } from "../../routes";
import type { StateElectionEvent } from "../../types";

export function StateElectionViewNav({ event, mode }: { event: StateElectionEvent; mode: "results" | "map" }) {
  const links = [
    { id: "results", label: "Keputusan", to: stateElectionPath(event.stateId, event.assemblyNumber) },
    { id: "map", label: "Peta", to: stateElectionMapPath(event.stateId, event.assemblyNumber) },
  ] as const;
  return <MotionConfig reducedMotion="user">
    <nav className="prn-view-tabs" aria-label="Paparan pilihan raya negeri">
      {links.map((item) => <Link key={item.id} to={item.to} className={mode === item.id ? "is-active" : ""}>
        {mode === item.id && <motion.span layoutId="prn-view-tab-active" transition={{ type: "spring", stiffness: 420, damping: 34 }}/>}
        <b>{item.label}</b>
      </Link>)}
    </nav>
  </MotionConfig>;
}
