export interface LayoutTile { id:string; kind:'chart'|'inputs'|'readings'|'table'|'controls'; label:string; x:number; y:number; w:number; h:number }

/** A preview of the declared panel geometry, never a miniature screenshot. */
export function PresetLayoutPreview({ tiles, label, detailed = false }: { tiles:LayoutTile[]; label:string; detailed?:boolean }) {
  const rows = Math.max(1, ...tiles.map(tile => tile.y + tile.h));
  return <div className={`dv-preset-preview${detailed ? ' dv-preset-preview-detailed' : ''}`} role="img" aria-label={`${label}: ${tiles.map(tile => tile.label).join(', ')}`} style={{gridTemplateRows:`repeat(${rows}, minmax(0,1fr))`}}>
    {tiles.map(tile => <div key={tile.id} className={`dv-preview-tile dv-preview-${tile.kind}`} style={{gridColumn:`${tile.x+1} / span ${tile.w}`,gridRow:`${tile.y+1} / span ${tile.h}`}} aria-hidden>
      {tile.kind === 'chart' ? <svg viewBox="0 0 100 34" preserveAspectRatio="none"><path d="M0 27 L12 25 L23 13 L35 16 L46 9 L57 15 L69 6 L80 10 L90 5 L100 7" /></svg> : <span className="dv-preview-lines"><i/><i/><i/></span>}
      {detailed && <span className="dv-preview-label">{tile.label}</span>}
    </div>)}
  </div>;
}
