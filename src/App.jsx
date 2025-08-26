import React, { useEffect, useMemo, useState } from "react";

// ===== Module 1 – Asset Registry & Hierarchy (Clean Build v7.11.3) =====
// v7.11.3: Remove Dev Tests & Edge Tests from public UI.
// v7.11.2: Remove "Load Sample" button (to avoid accidental data additions). 
// v7.11.1: Keep last selected Parent after Add (no auto-reset).
// v7.11 (small update):
//  - Removed buttons: Undo, Import from URL (per request).
//  - Switched all UI labels/buttons to English.
//  - No breaking logic changes; baseline v7.9 is still our rollback point.

// Storage keys
const LS_KEY = "module1_asset_nodes";
const LEGACY_KEYS = [
  "module1_asset_nodes_v4",
  "module1_asset_nodes_v3",
  "module1_asset_nodes_v2",
  "module1_asset_nodes_v1",
];

// ---- Helpers: storage & data ----
function uid() { return Math.random().toString(36).slice(2, 10); }
function readKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch { return null; }
}
function save(nodes) { try { localStorage.setItem(LS_KEY, JSON.stringify(nodes)); } catch {} }
function migrateArray(arr, srcKey) {
  return arr.map((x) => {
    const type = x && typeof x.type === "string" ? x.type : "Component";
    const base = { id: String(x.id), name: String(x.name), type, parentId: x && x.parentId ? String(x.parentId) : null, createdAt: Number(x.createdAt) || Date.now() };
    if (type === "Subsystem") {
      const lv = Number(x.level);
      const zeroBased = srcKey === "module1_asset_nodes_v2" || srcKey === "module1_asset_nodes_v1";
      if (Number.isFinite(lv)) return { ...base, level: Math.max(1, zeroBased ? lv + 1 : lv) };
      return { ...base, level: 1 };
    }
    return { ...base, level: null };
  });
}
function mergeByIdNewest(arrays) { const byId = new Map(); arrays.flat().forEach((it) => { const prev = byId.get(it.id); if (!prev || (Number(it.createdAt) || 0) >= (Number(prev.createdAt) || 0)) byId.set(it.id, it); }); return Array.from(byId.values()); }
function loadInitial() {
  const current = readKey(LS_KEY);
  if (current && current.length) return current;
  const migrated = [];
  for (const k of LEGACY_KEYS) { const arr = readKey(k); if (arr && arr.length) migrated.push(migrateArray(arr, k)); }
  if (migrated.length) { const merged = mergeByIdNewest(migrated); save(merged); return merged; }
  return [];
}

// ---- Tree helpers ----
function toTree(nodes) {
  const map = new Map(); nodes.forEach((n) => map.set(n.id, { ...n, children: [] }));
  const roots = [];
  map.forEach((n) => { if (n.parentId) { const p = map.get(n.parentId); if (p) p.children.push(n); else roots.push(n); } else { roots.push(n); } });
  const order = { System: 0, Subsystem: 1, Component: 2 };
  function sortRec(arr) { arr.sort((a, b) => { if (order[a.type] !== order[b.type]) return order[a.type] - order[b.type]; return String(a.name).localeCompare(String(b.name)); }); arr.forEach((c) => sortRec(c.children)); }
  sortRec(roots); return roots;
}
function getDescendantIds(id, list) { const out = [id]; list.filter((a) => a.parentId === id).forEach((child) => { out.push(...getDescendantIds(child.id, list)); }); return out; }

// ---- Rules ----
function checkParentRule(childType, lvl, parent) {
  if (childType === "System") return { ok: true };
  if (childType === "Subsystem") {
    if (!parent) return { ok: false, err: "Subsystem requires a parent" };
    if (lvl === 1) return parent.type === "System" ? { ok: true } : { ok: false, err: "Parent of Subsystem L1 must be a System" };
    if (parent.type !== "Subsystem") return { ok: false, err: `Parent of Subsystem L${lvl} must be Subsystem L${lvl - 1}` };
    return Number(parent.level) === lvl - 1 ? { ok: true } : { ok: false, err: `Parent of Subsystem L${lvl} must be Subsystem L${lvl - 1}` };
  }
  if (childType === "Component") {
    return parent && parent.type === "Subsystem" ? { ok: true } : { ok: false, err: "Parent of Component must be a Subsystem" };
  }
  return { ok: false, err: "Unknown type" };
}

// ---- UI atoms ----
function Card({ children, className = "" }) { return <div className={"rounded-2xl shadow-md border border-gray-200 bg-white " + className}>{children}</div>; }
function SectionTitle({ children }) { return <h2 className="text-xl font-semibold tracking-tight mb-3">{children}</h2>; }
function Label({ children }) { return <label className="text-sm text-gray-700 font-medium">{children}</label>; }
function TextInput(props) { const cls = "w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 "; return <input {...props} className={(props.className ? props.className + " " : "") + cls} />; }
function Select(props) { const cls = "w-full rounded-xl border px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 "; return <select {...props} className={(props.className ? props.className + " " : "") + cls} />; }
function Button({ children, className = "bg-indigo-600 text-white border-indigo-600", ...props }) { const cls = "rounded-2xl px-4 py-2 border shadow-sm hover:shadow transition active:scale-[0.99] "; return (<button type="button" {...props} className={cls + className}>{children}</button>); }
function Pill({ children, tone = "indigo" }) { const map = { indigo: "bg-indigo-50 text-indigo-700 border-indigo-200", slate: "bg-slate-50 text-slate-700 border-slate-200", rose: "bg-rose-50 text-rose-700 border-rose-200", }; return <span className={"px-2 py-1 rounded-full text-xs border " + map[tone]}>{children}</span>; }
function Tree({ nodes }) {
  return (
    <ul className="pl-4">
      {(nodes || []).map((n) => (
        <li key={n.id} className="relative">
          <div className="mb-1 flex items-center gap-2">
            <Pill tone={n.type === "System" ? "indigo" : n.type === "Subsystem" ? "slate" : "rose"}>{n.type}</Pill>
            <span className="font-medium">{n.name}{n.type === "Subsystem" && n.level != null ? " (L" + n.level + ")" : ""}</span>
          </div>
          {n.children && n.children.length > 0 ? (
            <div className="border-l border-dashed ml-2 pl-4"><Tree nodes={n.children} /></div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ---- App ----
export default function App() {
  const [nodes, setNodes] = useState([]);
  const [history, setHistory] = useState([]); // kept internally (no Undo button shown)
  const [name, setName] = useState("");
  const [type, setType] = useState("System");
  const [parentId, setParentId] = useState("");
  const [subsystemLevel, setSubsystemLevel] = useState("");
  const [filter, setFilter] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("System");
  const [editParentId, setEditParentId] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");

  // init
  useEffect(() => { setNodes(loadInitial()); }, []);
  useEffect(() => { save(nodes); }, [nodes]);

  // Auto defaults & parent selection behavior (no auto-pick first; keep last valid choice)
  useEffect(() => {
    if (type === "Subsystem") {
      const lv = Number(subsystemLevel);
      if (!Number.isFinite(lv) || lv < 1) { setParentId(""); return; }
      const candidates = lv === 1
        ? nodes.filter((n) => n.type === "System")
        : nodes.filter((n) => n.type === "Subsystem" && Number(n.level) === lv - 1);
      // If current selection becomes invalid, clear it; otherwise keep it. Do not auto-select first option.
      if (parentId && !candidates.some((c) => c.id === parentId)) {
        setParentId("");
      }
      return;
    }
    if (type === "Component") {
      const candidates = nodes.filter((n) => n.type === "Subsystem");
      if (parentId && !candidates.some((c) => c.id === parentId)) {
        setParentId("");
      }
      return;
    }
    // For System type, no parent
    if (type === "System") setParentId("");
  }, [type, subsystemLevel, nodes]);

  // Parent options (add form)
  const addParentOptions = useMemo(() => {
    if (type === "System") return [];
    if (type === "Subsystem") {
      const lv = Number(subsystemLevel);
      if (!Number.isFinite(lv) || lv < 1) return [];
      if (lv === 1) return nodes.filter((n) => n.type === "System").slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
      return nodes.filter((n) => n.type === "Subsystem" && Number(n.level) === lv - 1).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    }
    if (type === "Component") { return nodes.filter((n) => n.type === "Subsystem").slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))); }
    return [];
  }, [type, subsystemLevel, nodes]);

  // Parent options (edit form)
  const editParentOptions = useMemo(() => {
    if (!editingId) return [];
    const blocked = new Set(getDescendantIds(editingId, nodes));
    blocked.add(editingId);
    if (editType === "System") return [];
    if (editType === "Subsystem") {
      const lv = Number(editLevel);
      if (!Number.isFinite(lv) || lv < 1) return [];
      if (lv === 1) return nodes.filter((n) => n.type === "System" && !blocked.has(n.id)).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
      return nodes.filter((n) => n.type === "Subsystem" && Number(n.level) === lv - 1 && !blocked.has(n.id)).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name)));
    }
    if (editType === "Component") { return nodes.filter((n) => n.type === "Subsystem" && !blocked.has(n.id)).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))); }
    return [];
  }, [editingId, editType, editLevel, nodes]);

  const tree = useMemo(() => toTree(nodes), [nodes]);
  const filtered = useMemo(() => { const q = filter.trim().toLowerCase(); if (!q) return nodes; return nodes.filter((n) => [n.name, n.type, n.id].some((t) => String(t).toLowerCase().includes(q))); }, [nodes, filter]);
  function pushHistory() { setHistory((h) => [JSON.parse(JSON.stringify(nodes)), ...h].slice(0, 50)); }

  // ---- CRUD ----
  function addNode() {
    try {
      const nm = name.trim(); if (!nm) { alert("Name is required"); return; }
      const parent = nodes.find((n) => n.id === parentId) || null;
      let lvl = null;
      if (type === "Subsystem") {
        if (!subsystemLevel.trim()) { alert("Enter Subsystem Level (number)"); return; }
        const v = Number(subsystemLevel); if (!Number.isFinite(v) || v < 1) { alert("Subsystem Level must be a number >= 1"); return; }
        lvl = v;
        if (!parent) {
          const needed = v === 1 ? "System" : `Subsystem L${v-1}`;
          alert(`Choose Parent: ${needed}`);
          return;
        }
      }
      const rule = checkParentRule(type, lvl, parent); if (!rule.ok) { alert(rule.err); return; }

      pushHistory();
      const newNode = { id: uid(), name: nm, type, parentId: parent ? parent.id : null, level: type === "Subsystem" ? lvl : null, createdAt: Date.now() };
      setNodes((prev) => [newNode, ...prev]);
      setName("");
      if (type !== "Subsystem") setSubsystemLevel("");
      // Do NOT reset parentId — keep last selection so next entry can use the same parent
    } catch (err) {
      alert("Failed to add node: " + (err && err.message ? err.message : String(err)));
    }
  }

  function beginEdit(n) { setPendingDeleteId(""); setEditingId(n.id); setEditName(n.name); setEditType(n.type); setEditParentId(n.parentId || ""); setEditLevel(n.type === "Subsystem" && n.level != null ? String(n.level) : ""); }
  function cancelEdit() { setEditingId(""); setEditName(""); setEditType("System"); setEditParentId(""); setEditLevel(""); }
  const editBlockedIds = useMemo(() => (editingId ? new Set(getDescendantIds(editingId, nodes)) : new Set()), [editingId, nodes]);
  function saveEdit() {
    if (!editingId) return;
    const nm = editName.trim(); if (!nm) { alert("Name is required"); return; }
    const newType = editType; const newParentId = newType === "System" ? "" : editParentId;
    if (newParentId === editingId) { alert("Parent cannot be itself"); return; }
    if (newParentId && editBlockedIds.has(newParentId)) { alert("Parent cannot be one of its own descendants"); return; }
    const parent = nodes.find((x) => x.id === newParentId) || null;
    let lvl = null;
    if (newType === "Subsystem") {
      if (!editLevel.trim()) { alert("Enter Subsystem Level (number)"); return; }
      const v = Number(editLevel); if (!Number.isFinite(v) || v < 1) { alert("Subsystem Level must be a number >= 1"); return; }
      lvl = v;
    }
    const rule = checkParentRule(newType, lvl, parent); if (!rule.ok) { alert(rule.err); return; }
    const hasChildren = nodes.some((x) => x.parentId === editingId);
    if (newType === "Component" && hasChildren) { alert("Cannot change to Component because this node has children"); return; }

    pushHistory();
    setNodes((prev) => prev.map((x) => x.id === editingId ? { ...x, name: nm, type: newType, parentId: newType === "System" ? null : (newParentId || null), level: newType === "Subsystem" ? lvl : null } : x));
    cancelEdit();
  }

  // ---- Delete with inline confirm ----
  function askDelete(node) { setEditingId(""); setPendingDeleteId(node.id); }
  function cancelDelete() { setPendingDeleteId(""); }
  function confirmDelete() { if (!pendingDeleteId) return; const delIds = new Set(getDescendantIds(pendingDeleteId, nodes)); pushHistory(); setNodes((prev) => prev.filter((a) => !delIds.has(a.id))); setPendingDeleteId(""); }

  // ---- Utilities ----
  function clearAll() { if (!confirm("Clear all data?")) return; pushHistory(); try { localStorage.removeItem(LS_KEY); } catch {} setNodes([]); }
  function loadSample() {
    if (!confirm("Load sample data? This will add sample items.")) return;
    const now = Date.now(); const rootId = uid(); const propId = uid(); const brakeId = uid(); const tractionCtlId = uid(); const invId = uid(); const mcId = uid();
    const sample = [
      { id: rootId, name: "Trainset Series 12", type: "System", parentId: null, level: null, createdAt: now },
      { id: propId, name: "Propulsion", type: "Subsystem", parentId: rootId, level: 1, createdAt: now },
      { id: brakeId, name: "Brake", type: "Subsystem", parentId: rootId, level: 1, createdAt: now },
      { id: tractionCtlId, name: "Traction Control", type: "Subsystem", parentId: propId, level: 2, createdAt: now },
      { id: invId, name: "Traction Inverter", type: "Component", parentId: tractionCtlId, level: null, createdAt: now },
      { id: mcId, name: "Master Controller", type: "Component", parentId: rootId, level: null, createdAt: now },
    ];
    pushHistory(); setNodes((prev) => [...sample, ...prev]);
  }

  // Export JSON – Save Picker → object URL (auto-click) → new tab
  async function exportJSON() {
    try {
      const dataStr = JSON.stringify(nodes, null, 2);
      const suggested = "module1_assets_" + new Date().toISOString().replace(/[:.]/g, "-") + ".json";

      // A) Native Save dialog
      try {
        if (self.isSecureContext && typeof window.showSaveFilePicker === 'function') {
          const handle = await window.showSaveFilePicker({
            suggestedName: suggested,
            excludeAcceptAllOption: false,
            types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
            startIn: 'downloads'
          });
          const writable = await handle.createWritable();
          await writable.write(new Blob([dataStr], { type: 'application/json' }));
          await writable.close();
          return;
        }
      } catch (e) {
        if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return; // user cancelled
        // continue to fallback
      }

      // B) Object URL (auto download)
      try {
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = suggested;
        document.body.appendChild(a);
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        setTimeout(() => { try { document.body.removeChild(a); URL.revokeObjectURL(url); } catch {} }, 1500);
        return;
      } catch (e2) {}

      // C) New tab fallback
      try {
        const w = window.open('', '_blank');
        if (w) {
          w.document.open();
          const safe = String(dataStr).replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]));
          w.document.write('<!doctype html><meta charset="utf-8"><title>' + suggested + '</title><pre style="white-space:pre-wrap;word-wrap:break-word;padding:16px;">' + safe + '</pre>');
          w.document.close();
          return;
        }
      } catch (e3) {}

      alert('Export failed due to sandbox limitations. Try on an HTTPS domain or enable Chrome "Ask where to save each file before downloading".');
    } catch (err) {
      alert('Export error: ' + (err && err.message ? err.message : String(err)));
    }
  }

  function importJSON(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try {
      const parsed = JSON.parse(String(reader.result)); if (!Array.isArray(parsed)) throw new Error("Unknown format");
      const sanitized = parsed.filter((x) => x && x.id && x.name && x.type).map((x) => ({ id: String(x.id), name: String(x.name), type: x.type === "System" || x.type === "Subsystem" || x.type === "Component" ? x.type : "Component", parentId: x.parentId ? String(x.parentId) : null, level: x.type === "Subsystem" && Number.isFinite(Number(x.level)) ? Math.max(1, Number(x.level)) : (x.type === "Subsystem" ? 1 : null), createdAt: Number(x.createdAt) || Date.now() }));
      pushHistory(); setNodes((prev) => [...sanitized, ...prev]); e.target.value = "";
    } catch (err) { alert("Import failed: " + (err && err.message ? err.message : String(err))); } };
    reader.readAsText(f);
  }

  // ---- Render ----
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <h1 className="text-2xl font-bold tracking-tight">Module 1 – Asset Registry & Hierarchy (Clean Build v7.11.3)</h1>
          <p className="text-slate-600 mt-1">Enter asset data, store locally, and display in a table & graphical hierarchy. Subsystem Level starts at 1.</p>
        </div>

        {/* Form */}
        <Card className="p-5 lg:col-span-1">
          <SectionTitle>Add Node</SectionTitle>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <TextInput placeholder="e.g. Trainset Series 12 / Brake Unit / Master Controller" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onChange={(e) => setType(e.target.value)}>
                <option>System</option>
                <option>Subsystem</option>
                <option>Component</option>
              </Select>
            </div>
            <div>
              <Label>Subsystem Level {type !== "Subsystem" ? "(active when Type = Subsystem)" : ""}</Label>
              <TextInput type="number" min={1} step={1} placeholder="e.g. 1, 2, 3" value={subsystemLevel} onChange={(e) => setSubsystemLevel(e.target.value)} disabled={type !== "Subsystem"} />
            </div>
            <div>
              <Label>Parent {type === "System" ? "(auto empty)" : ""}</Label>
              <Select value={parentId} onChange={(e) => setParentId(e.target.value)} disabled={type === "System"}>
                {type === "System" ? <option value="">— None (Root) —</option> : null}
                {addParentOptions.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={addNode}>Add</Button><Button className="bg-white text-rose-700 border-rose-300" onClick={clearAll}>Clear All</Button>
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <SectionTitle>Asset Table</SectionTitle>
            <div className="flex items-center gap-2 flex-wrap justify-end">              <div className="w-56 sm:w-64 md:w-80">
                <TextInput placeholder="Search name/type/ID…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>
              {/* Undo button removed as requested */}
              <Button className="bg-white text-slate-700 border-slate-300" onClick={exportJSON}>Export JSON</Button>
              <label className="cursor-pointer inline-block">
                <span className="rounded-2xl px-4 py-2 border border-slate-300 bg-white">Import JSON</span>
                <input type="file" accept="application/json" className="hidden" onChange={importJSON} />
              </label>
              {/* Import from URL button removed as requested */}
            </div>
          </div>

          {editingId ? (
            <div className="mb-3 p-3 border rounded-xl bg-slate-50">
              <div className="flex items-center justify-between mb-2">
                <div className="font-semibold">Edit Node</div>
                <div className="text-xs text-slate-500">ID: <span className="font-mono">{editingId}</span></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <div className="md:col-span-2"><Label>Name</Label><TextInput value={editName} onChange={(e) => setEditName(e.target.value)} /></div>
                <div><Label>Type</Label><Select value={editType} onChange={(e) => setEditType(e.target.value)}><option>System</option><option>Subsystem</option><option>Component</option></Select></div>
                <div><Label>Subsystem Level {editType !== "Subsystem" ? "(active when Type = Subsystem)" : ""}</Label><TextInput type="number" min={1} step={1} value={editLevel} onChange={(e) => setEditLevel(e.target.value)} disabled={editType !== "Subsystem"} /></div>
                <div><Label>Parent {editType === "System" ? "(auto empty)" : ""}</Label><Select value={editType === "System" ? "" : editParentId} onChange={(e) => setEditParentId(e.target.value)} disabled={editType === "System"}>{editType === "System" ? <option value="">— None (Root) —</option> : null}{editParentOptions.map((p) => (<option key={p.id} value={p.id}>{p.name} ({p.type})</option>))}</Select></div>
              </div>
              <div className="mt-2 flex gap-2"><Button onClick={saveEdit}>Save</Button><Button className="bg-white text-slate-700 border-slate-300" onClick={cancelEdit}>Cancel</Button></div>
            </div>
          ) : null}

          <div className="overflow-auto rounded-xl border">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100"><tr><th className="text-left p-2 font-semibold">Name</th><th className="text-left p-2 font-semibold">Type</th><th className="text-left p-2 font-semibold">Level</th><th className="text-left p-2 font-semibold">Parent</th><th className="text-left p-2 font-semibold">ID</th><th className="text-left p-2 font-semibold">Created</th><th className="text-left p-2 font-semibold">Actions</th></tr></thead>
              <tbody>
                {filtered.map((n) => (
                  <tr key={n.id} className="border-t">
                    <td className="p-2">{n.name}</td>
                    <td className="p-2">{n.type}</td>
                    <td className="p-2">{n.type === "Subsystem" && n.level != null ? n.level : "—"}</td>
                    <td className="p-2">{(nodes.find((x) => x.id === n.parentId) || {}).name || "—"}</td>
                    <td className="p-2 font-mono text-xs">{n.id}</td>
                    <td className="p-2">{new Date(n.createdAt).toLocaleString()}</td>
                    <td className="p-2"><div className="flex gap-2"><Button className="bg-white text-slate-700 border-slate-300" onClick={() => beginEdit(n)}>Edit</Button>{pendingDeleteId === n.id ? (<><Button className="bg-white text-rose-700 border-rose-300" onClick={confirmDelete}>Confirm Delete?</Button><Button className="bg-white text-slate-700 border-slate-300" onClick={cancelDelete}>Cancel</Button></>) : (<Button className="bg-white text-rose-700 border-rose-300" onClick={() => askDelete(n)}>Delete</Button>)}</div></td>
                  </tr>
                ))}
                {filtered.length === 0 ? (<tr><td className="p-4 text-center text-slate-500" colSpan={7}>No data yet</td></tr>) : null}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Hierarchy */}
        <Card className="p-5 lg:col-span-3">
          <SectionTitle>System Hierarchy (Graphical)</SectionTitle>
          {tree.length === 0 ? (
            <p className="text-slate-500">No nodes yet. Add a System first, then Subsystems/Components.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Hierarchy Tree</h3>
                <Tree nodes={tree} />
              </div>
              <div>
                <h3 className="font-semibold mb-2">Notes</h3>
                <ul className="text-sm list-disc pl-5 space-y-1 text-slate-700">
                  <li><b>System</b>: top/root level (e.g., Trainset, Depot System).</li>
                  <li><b>Subsystem</b>: parts under System (e.g., Propulsion, Brake). <i>Level</i> starts at 1.</li>
                  <li><b>Component</b>: smallest maintainable unit (e.g., Traction Inverter, Master Controller).</li>
                </ul>
              </div>
            </div>
          )}
        </Card>

        </div>
    </div>
  );
}
