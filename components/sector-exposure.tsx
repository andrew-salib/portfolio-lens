"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Asset, HoldingExposure } from "@/lib/portfolio";
import type { createSectorPie } from "@/lib/sector-pie-scene";

const COLORS = [
  "#3455dc",
  "#40a6ad",
  "#a18be0",
  "#e8a54c",
  "#d87795",
  "#669c76",
  "#537aaf",
  "#bf956b",
  "#7b91a3",
  "#aa659d",
  "#a6ad61",
  "#65bac7",
  "#aeb6c5",
  "#c98465",
  "#6986d5",
];
function percent(value: number) {
  if (value > 0 && value < 0.01) return "<0.01%";
  return value.toFixed(2) + "%";
}
const PAGE_SIZE = 14;
type Props = {
  sectors: [string, number][];
  holdings: HoldingExposure[];
  assets: Asset[];
};

export function SectorExposure({ sectors, holdings, assets }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<ReturnType<typeof createSectorPie> | null>(null);
  const [sector, setSector] = useState("");
  const [offset, setOffset] = useState(0);
  const [hovered, setHovered] = useState("");
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("Loading interactive chart…");
  const active = sectors.some(([name]) => name === sector) ? sector : "";
  const sectorHoldings = useMemo(
    () =>
      holdings
        .filter((holding) => holding.sector === active && holding.exposure > 0)
        .sort((left, right) => right.exposure - left.exposure),
    [holdings, active],
  );
  const slices = useMemo(() => {
    let items: { name: string; value: number; holding?: HoldingExposure }[];
    if (!active) {
      items = sectors.map(([name, value]) => ({ name, value }));
    } else if (!sectorHoldings.length) {
      items = [
        {
          name: "Unmapped / unallocated",
          value: sectors.find(([name]) => name === active)?.[1] || 0,
        },
      ];
    } else {
      const remaining = sectorHoldings.slice(
        offset < sectorHoldings.length ? offset : 0,
      );
      items = remaining.slice(0, PAGE_SIZE).map((holding) => ({
        name: holding.ticker + " · " + holding.name,
        value: holding.exposure,
        holding,
      }));
      // Bound the mesh count without dropping any exposure from the pie.
      if (remaining.length > PAGE_SIZE)
        items.push({
          name: "Other holdings (" + (remaining.length - PAGE_SIZE) + ")",
          value: remaining
            .slice(PAGE_SIZE)
            .reduce((sum, item) => sum + item.exposure, 0),
        });
    }
    return items
      .filter((item) => item.value > 0)
      .map((item, index) => ({
        ...item,
        color: COLORS[index % COLORS.length],
      }));
  }, [sectors, sectorHoldings, active, offset]);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const focus = slices.find((slice) => slice.name === (hovered || selected));
  const focusRef = useRef("");
  const latest = useRef(slices);
  const selectRef = useRef<(name: string) => void>(() => {});

  selectRef.current = (name) => {
    focusRef.current = name;
    setHovered("");
    setSelected("");
    if (!active) {
      setOffset(0);
      setSector(name);
    } else if (name.startsWith("Other holdings (")) {
      setOffset((value) => value + PAGE_SIZE);
    } else {
      setSelected(name);
      scene.current?.select(name);
    }
  };

  useEffect(() => {
    latest.current = slices;
    scene.current?.update(slices, focusRef.current);
  }, [slices]);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let cancelled = false;
    let instance: ReturnType<typeof createSectorPie> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      import("@/lib/sector-pie-scene")
        .then(({ createSectorPie }) => {
          if (cancelled) return;
          instance = createSectorPie(
            element,
            latest.current,
            (name) => selectRef.current(name),
            setHovered,
          );
          scene.current = instance;
          setStatus("");
        })
        .catch(() => {
          if (!cancelled) setStatus("3D unavailable. Use the buttons below.");
        });
    });
    observer.observe(element);
    return () => {
      cancelled = true;
      observer.disconnect();
      instance?.dispose();
      scene.current = null;
    };
  }, []);

  function back() {
    focusRef.current = "";
    setHovered("");
    setSelected("");
    if (offset) setOffset(0);
    else setSector("");
  }

  return (
    <div className="sector-exposure">
      {active && (
        <div className="panel-title sector-navigation">
          <button type="button" className="text-button" onClick={back}>
            ← {offset ? "All sector holdings" : "All sectors"}
          </button>
          <strong>
            {active}
            {offset ? " · Other holdings" : ""}
          </strong>
        </div>
      )}
      <div className="sector-pie-stage">
        <div ref={host} className="sector-pie-canvas" aria-hidden="true" />
        {status && <span className="sector-pie-status">{status}</span>}
        {focus && (
          <div className="sector-pie-tooltip" role="status">
            <strong>{focus.name}</strong>
            <span>
              {percent(focus.value)} of portfolio
              {active && " · " + percent((focus.value / total) * 100) + " of this view"}
            </span>
            {focus.holding && (
              <span>
                Held through{" "}
                {focus.holding.via
                  .map((source) => {
                    const asset = assets.find((item) => item.ticker === source.ticker);
                    return (
                      (asset?.name || source.ticker) +
                      " (" +
                      percent(source.exposure) +
                      ")"
                    );
                  })
                  .join(", ")}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="sector-pie-hint">
        {!slices.length
          ? "Add assets to see your sector mix."
          : !active
            ? "Hover to identify a sector. Click to explore its holdings."
            : !sectorHoldings.length
              ? "Underlying holdings are unavailable for this portion."
              : "Select a holding to see which stocks and ETFs contribute."}
      </p>
      <div className="sector-pie-key" aria-label={active || "Select a sector"}>
        {slices.map((slice) => (
          <button
            key={slice.name}
            type="button"
            aria-pressed={selected === slice.name}
            onClick={() => selectRef.current(slice.name)}
            onFocus={() => setHovered(slice.name)}
            onBlur={() => setHovered("")}
          >
            <i style={{ background: slice.color }} />
            <span>{slice.name}</span>
            <strong>{percent(slice.value)}</strong>
          </button>
        ))}
      </div>
      <p className="sector-pie-hint sector-percentage-note">
        Labels show % of your whole portfolio.
      </p>
    </div>
  );
}
