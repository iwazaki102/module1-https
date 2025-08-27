import React, { useEffect, useMemo, useState } from "react";

// ===== Module 1 – Asset Registry & Hierarchy (Clean Build v7.13.7) =====
// v7.13.7 – Remove "Keep fields after Add" checkbox (UI only). Behavior unchanged: after Add → Name cleared; Type kept; Level cleared only if Type ≠ Subsystem.
// v7.13.6 – Fix: incomplete <tbody>{filtered.map…} block causing syntax error; hardened table rendering and closed all JSX tags.
// v7.13.5 – Delete warning when node has children (cascade confirmation). Fixed truncated table action JSX.
// v7.13.4 – Fix unterminated JSX </Button> for Edit action in table; no logic changes.
// v7.13.3 – Fix unterminated JSX </Button> in table actions; keep all features stable.
// v7.13.2 – Fix unterminated JSX comment; ensure auto-select Parent when exactly one candidate exists; add tests for name indexing.
// v7.13.1 – Auto-select Parent when exactly one valid candidate exists (L1→System, Ln→L(n-1)); clearer messages when no parent exists; minor UX polish.
// v7.13.0 – Enforce single System; duplicate policy (overwrite or index like Router(1)); UI guards; extra tests.
// Baseline for rollback remains: v7.11.3

// Storage keys
const LS_KEY = "module1_asset_nodes";
const LS_PREF = {
  // keepFields removed in v7.13.7 (UI only)
  showTree: "module1_pref_show_tree",
  activeTab: "module1_pref_active_tab",
  collapsed: "module1_pref_collapsed_ids",
  importPolicy: "module1_pref_import_policy",
};
const LEGACY_KEYS = [
  "module1_asset_nodes_v4",
  "module1_asset_nodes_v3",
  "module1_asset_nodes_v2",
  "module1_asset_nodes_v1",
];

// ---- Helpers: storage & data ----
function uid() { return Math.random().toString(36).slice(2, 10); }
function readKey(key) {
  try { const raw = localStorage.getItem(key); if (!raw) return null; const v = JSON.parse(raw); return v; } catch { return null; }
}
function readArray(key) { try { const raw = localStorage.getItem(key); if (!raw) return null; const arr = JSON.parse(raw); return Array.isArray(arr) ? arr : null; } catch { return null; } }
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
  const current = readArray(LS_KEY);
  if (current && current.length) return current;
  const migrated = [];
  for (const k of LEGACY_KEYS) { const arr = readArray(k); if (arr && arr.length) migrated.push(migrateArray(arr, k)); }
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
function getAllWithChildrenIds(tree) { const ids = []; function walk(n){ if ((n.children||[]).length>0) ids.push(n.id); (n.children||[]).forEach(walk); } tree.forEach(walk); return ids; }

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
function isDuplicate(list, { id, name, type, level, parentId }, ignoreId = null) {
  const nm = String(name).trim().toLowerCase();
  return list.some((x) => {
    if (ignoreId && x.id === ignoreId) return false;
    if (String(x.type) !== String(type)) return false;
    if (String(x.parentId || '') !== String(parentId || '')) return false;
    if (String(x.name).trim().toLowerCase() !== nm) return false;
    if (type === 'Subsystem') return Number(x.level) === Number(level);
    return true; // System/Component
  });
}
function findDuplicateNode(list, { id, name, type, level, parentId }, ignoreId = null) {
  const nm = String(name).trim().toLowerCase();
  return list.find((x)=>{
    if (ignoreId && x.id === ignoreId) return false;
    if (String(x.type) !== String(type)) return false;
    if (String(x.parentId || '') !== String(parentId || '')) return false;
    if (String(x.name).trim().toLowerCase() !== nm) return false;
    if (type === 'Subsystem') return Number(x.level) === Number(level);
    return true;
  }) || null;
}
function nextIndexedName(baseName, siblingNames) {
  // strip trailing (n) if present to get root base
  const m = String(baseName).match(/^(.*?)(\((\d+)\))?\s*$/);
  const root = (m ? m[1] : String(baseName)).trim();
  const used = new Set();
  siblingNames.forEach((s)=>{
    const esc = root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mm = String(s).match(new RegExp('^' + esc + '(?:\\((\\d+)\\))?$'));
    if (mm) used.add(mm[1] ? Number(mm[1]) : 0);
  });
  let n = 1; while (used.has(n)) n++;
  return `${root}(${n})`;
}

// ---- Non-UI dev tests (call via window.__module1RunTests()) ----
function __buildTests() {
  const sys = { id: 'S', type: 'System', name: 'Root', level: null };
  const s1 = { id: 'A', type: 'Subsystem', name: 'L1', level: 1, parentId: 'S' };
  const s2 = { id: 'B', type: 'Subsystem', name: 'L2', level: 2, parentId: 'A' };
  const comp = { id: 'C', type: 'Component', name: 'Comp', level: null, parentId: 'B' };
  const orphan = { id: 'X', type: 'Subsystem', name: 'Orphan L2', level: 2, parentId: 'NOPE' };

  const list = [sys, s1, s2, comp, orphan];
  const results = [];
  // Existing tests (unchanged)
  results.push(['Sub L1 -> System', checkParentRule('Subsystem', 1, sys).ok]);
  results.push(['Sub L2 -> System (should fail)', !checkParentRule('Subsystem', 2, sys).ok]);
  results.push(['Sub L2 -> Sub L1', checkParentRule('Subsystem', 2, s1).ok]);
  results.push(['Component -> Subsystem', checkParentRule('Component', null, s2).ok]);
  results.push(['Component -> System (should fail)', !checkParentRule('Component', null, sys).ok]);
  const t = toTree(list);
  const okTree = t.some(n=>n.id==='S') && t.some(n=>n.id==='X');
  results.push(['Tree has Root & Orphan as roots', okTree]);
  const dup = isDuplicate([s2], { id:'', name:'L2', type:'Subsystem', level:2, parentId:'A' });
  results.push(['Duplicate detection works', dup===true]);

  // Additional tests
  results.push(['Sub L3 -> Sub L1 (should fail)', !checkParentRule('Subsystem', 3, s1).ok]);
  results.push(['Duplicate System name under root', isDuplicate([sys], { id:'', name:'Root', type:'System', level:null, parentId:null }) === true]);
  results.push(['Duplicate Component under same parent', isDuplicate([comp], { id:'', name:'Comp', type:'Component', level:null, parentId:'B' }) === true]);
  results.push(['Component same name different parent allowed', isDuplicate([comp], { id:'', name:'Comp', type:'Component', level:null, parentId:'A' }) === false]);
  const descA = new Set(getDescendantIds('A', list));
  results.push(['getDescendantIds includes children', descA.has('A') && descA.has('B') && descA.has('C') && !descA.has('X')]);
  const idsWithChildren = new Set(getAllWithChildrenIds(toTree(list)));
  results.push(['getAllWithChildrenIds', idsWithChildren.has('S') && idsWithChildren.has('A') && idsWithChildren.has('B') && !idsWithChildren.has('X')]);
  const t2 = toTree(list);
  results.push(['Root order System first', t2.length>=1 && t2[0].id==='S']);

  // New tests (name indexing)
  const sibs = ['Router', 'Router(1)', 'Router(3)'];
  const next1 = nextIndexedName('Router', sibs);
  results.push(['nextIndexedName gaps -> Router(2)', next1 === 'Router(2)']);
  const next2 = nextIndexedName('Pump', []);
  results.push(['nextIndexedName empty -> Pump(1)', next2 === 'Pump(1)']);

  // Delete cascade size
  results.push(['Delete cascade count from A is 3', (new Set(getDescendantIds('A', list))).size === 3]);

  const pass = results.filter(r=>r[1]).length;
  return { pass, total: results.length, results };
}

// ---- UI atoms ----
function Card({ children, className = "" }) { return <div className={"rounded-2xl shadow-md border border-gray-200 bg-white " + className}>{children}</div>; }
function SectionTitle({ children }) { return <h2 className="text-xl font-semibold tracking-tight mb-3">{children}</h2>; }
function Label({ children, className = "" }) { return <label className={"text-xs text-gray-700 font-medium " + className}>{children}</label>; }
function TextInput({ size = "sm", className = "", ...props }) {
  const sizeCls = size === 'sm' ? 'rounded-lg px-2.5 py-1.5 text-sm' : 'rounded-xl px-3 py-2';
  const base = 'w-full border focus:outline-none focus:ring-2 focus:ring-indigo-500 ';
  return <input {...props} className={(className ? className + ' ' : '') + sizeCls + ' ' + base} />;
}
function Select({ size = 'sm', className = '', ...props }) {
  const sizeCls = size === 'sm' ? 'rounded-lg px-2.5 py-1.5 text-sm' : 'rounded-xl px-3 py-2';
  const base = 'w-full border bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ';
  return <select {...props} className={(className ? className + ' ' : '') + sizeCls + ' ' + base} />;
}
function Button({ children, size = 'sm', className = 'bg-indigo-600 text-white border-indigo-600', ...props }) {
  const sizeCls = size === 'sm' ? 'rounded-xl px-3 py-1.5 text-sm' : 'rounded-2xl px-4 py-2';
  const base = 'border shadow-sm hover:shadow transition active:scale-[0.99] ';
  return (<button type="button" {...props} className={sizeCls + ' ' + base + className}>{children}</button>);
}
function Pill({ children, tone = "indigo" }) { const map = { indigo: "bg-indigo-50 text-indigo-700 border-indigo-200", slate: "bg-slate-50 text-slate-700 border-slate-200", rose: "bg-rose-50 text-rose-700 border-rose-200", }; return <span className={"px-2 py-1 rounded-full text-xs border " + map[tone]}>{children}</span>; }

function Tree({ nodes, collapsedIds, onToggle }) {
  return (
    <ul className="pl-4">
      {(nodes || []).map((n) => {
        const collapsed = collapsedIds.has(n.id);
        const hasChildren = n.children && n.children.length > 0;
        return (
          <li key={n.id} className="relative">
            <div className="mb-1 flex items-center gap-2">
              {hasChildren ? (
                <button className="w-6 h-6 rounded-full border border-slate-300 text-xs leading-5 bg-white" onClick={() => onToggle(n.id)} aria-label={collapsed ? 'Expand' : 'Collapse'}>{collapsed ? "+" : "−"}</button>
              ) : (
                <span className="w-6 h-6 inline-block" />
              )}
              <Pill tone={n.type === "System" ? "indigo" : n.type === "Subsystem" ? "slate" : "rose"}>{n.type}</Pill>
              <span className="font-medium">
                {n.name}{n.type === "Subsystem" && n.level != null ? " (L" + n.level + ")" : ""}
              </span>
              {hasChildren ? <span className="text-xs px-2 py-0.5 rounded-full border border-slate-300 bg-slate-50 text-slate-700">{n.children.length}</span> : null}
            </div>
            {hasChildren && !collapsed ? (
              <div className="border-l border-dashed ml-2 pl-4"><Tree nodes={n.children} collapsedIds={collapsedIds} onToggle={onToggle} /></div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ---- App ----
export default function App() {
  const [nodes, setNodes] = useState([]);
  const [history, setHistory] = useState([]); // internal
  const [name, setName] = useState("");
  const [type, setType] = useState("System");
  const [parentId, setParentId] = useState("");
  const [subsystemLevel, setSubsystemLevel] = useState("");
  const [filter, setFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");
  const [importPolicy, setImportPolicy] = useState(() => readKey(LS_PREF.importPolicy) || "skip"); // 'skip' | 'update'

  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("System");
  const [editParentId, setEditParentId] = useState("");
  const [editLevel, setEditLevel] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState("");

  // Tree UI prefs
  const [showTree, setShowTree] = useState(() => {
    const v = readKey(LS_PREF.showTree); return v === null ? true : !!v;
  });
  const [activeTab, setActiveTab] = useState(() => readKey(LS_PREF.activeTab) || "table"); // 'table' | 'tree'
  const [collapsedIds, setCollapsedIds] = useState(() => new Set(readArray(LS_PREF.collapsed) || []));
  const [treeFullscreen, setTreeFullscreen] = useState(false);

  const hasSystem = useMemo(()=>nodes.some(n=>n.type==='System'), [nodes]);

  // init
  useEffect(() => { setNodes(loadInitial()); }, []);
  useEffect(() => { save(nodes); }, [nodes]);
  useEffect(() => { try { localStorage.setItem(LS_PREF.showTree, JSON.stringify(!!showTree)); } catch {} }, [showTree]);
  useEffect(() => { try { localStorage.setItem(LS_PREF.activeTab, JSON.stringify(activeTab)); } catch {} }, [activeTab]);
  useEffect(() => { try { localStorage.setItem(LS_PREF.collapsed, JSON.stringify(Array.from(collapsedIds))); } catch {} }, [collapsedIds]);
  useEffect(() => { try { localStorage.setItem(LS_PREF.importPolicy, JSON.stringify(importPolicy)); } catch {} }, [importPolicy]);

  // expose non-UI tests (developer only)
  useEffect(() => {
    try { (window as any).__module1RunTests = __buildTests; } catch {}
  }, []);

  // Auto defaults & parent selection behavior (keep last valid choice)
  useEffect(() => {
    if (type === "Subsystem") {
      const lv = Number(subsystemLevel);
      if (!Number.isFinite(lv) || lv < 1) { setParentId(""); return; }
      const candidates = lv === 1
        ? nodes.filter((n) => n.type === "System")
        : nodes.filter((n) => n.type === "Subsystem" && Number(n.level) === lv - 1);
      if (parentId && !candidates.some((c) => c.id === parentId)) { setParentId(""); }
      if (!parentId && candidates.length === 1) { setParentId(candidates[0].id); }
      return;
    }
    if (type === "Component") {
      const candidates = nodes.filter((n) => n.type === "Subsystem");
      if (parentId && !candidates.some((c) => c.id === parentId)) { setParentId(""); }
      if (!parentId && candidates.length === 1) { setParentId(candidates[0].id); }
      return;
    }
    if (type === "System") setParentId("");
  }, [type, subsystemLevel, nodes, parentId]);

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

  const byId = useMemo(() => { const m = new Map(); nodes.forEach(n=>m.set(n.id,n)); return m; }, [nodes]);
  const tree = useMemo(() => toTree(nodes), [nodes]);

  // Filters (search + type + level)
  const levelOptions = useMemo(() => {
    const set = new Set(nodes.filter(n=>n.type==='Subsystem').map(n=>Number(n.level)).filter(v=>Number.isFinite(v)));
    return Array.from(set).sort((a,b)=>a-b);
  }, [nodes]);
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return nodes.filter((n) => {
      if (q && ![n.name, n.type, n.id].some((t) => String(t).toLowerCase().includes(q))) return false;
      if (typeFilter !== 'All' && n.type !== typeFilter) return false;
      if (typeFilter === 'Subsystem' && levelFilter !== 'All') {
        if (Number(n.level) !== Number(levelFilter)) return false;
      }
      return true;
    });
  }, [nodes, filter, typeFilter, levelFilter]);

  function pushHistory() { setHistory((h) => [JSON.parse(JSON.stringify(nodes)), ...h].slice(0, 50)); }

  // ---- CRUD ----
  function addNode() {
    try {
      const nm = name.trim(); if (!nm) { alert("Name is required"); return; }

      // Single System rule
      if (type === 'System' && hasSystem) { alert('Only one System is allowed. Delete the existing System first.'); return; }

      let parent = nodes.find((n) => n.id === parentId) || null;
      let lvl = null;
      if (type === "Subsystem") {
        if (!subsystemLevel.trim()) { alert("Enter Subsystem Level (number)"); return; }
        const v = Number(subsystemLevel); if (!Number.isFinite(v) || v < 1) { alert("Subsystem Level must be a number >= 1"); return; }
        lvl = v;
        if (!parent) {
          const candidates = v === 1
            ? nodes.filter((n) => n.type === "System")
            : nodes.filter((n) => n.type === "Subsystem" && Number(n.level) === v - 1);
          if (candidates.length === 1) {
            parent = candidates[0]; try { setParentId(parent.id); } catch {}
          } else if (candidates.length === 0) {
            const needed = v === 1 ? "System" : `Subsystem L${v-1}`;
            alert(v === 1 ? "Please add a System first." : `Please create ${needed} first.`);
            return;
          } else {
            const needed = v === 1 ? "System" : `Subsystem L${v-1}`;
            alert(`Multiple parents found. Please choose a Parent (${needed}).`);
            return;
          }
        }
      }

      const key = { id:'', name:nm, type, level:lvl, parentId: parent ? parent.id : null };
      const dupe = findDuplicateNode(nodes, key);
      if (dupe) {
        const overwrite = confirm(`Duplicate detected in the same level (Type/Parent/Name).\n\nName: ${nm}\nType: ${type}${type==='Subsystem'&&lvl?` L${lvl}`:''}\nParent: ${parent?parent.name:'—'}\n\nOK = Overwrite existing, Cancel = Insert with index (e.g., ${nm}(1))`);
        if (overwrite) {
          pushHistory();
          setNodes(prev => prev.map(x => x.id === dupe.id ? { ...x, name: nm, type, parentId: parent ? parent.id : null, level: type === 'Subsystem' ? lvl : null, createdAt: Date.now() } : x));
          // Clear fields (UI behavior): Name always; Level only if type ≠ Subsystem; Type is kept
          setName(""); if (type !== 'Subsystem') setSubsystemLevel("");
          return;
        } else {
          // auto-index
          const siblings = nodes.filter(x=>{
            if (String(x.type) !== String(type)) return false;
            if (String(x.parentId || '') !== String(parent ? parent.id : '')) return false;
            if (type==='Subsystem' && Number(x.level)!==Number(lvl)) return false;
            return true;
          }).map(x=>x.name);
          const nm2 = nextIndexedName(nm, siblings);
          key.name = nm2;
        }
      }

      const rule = checkParentRule(type, lvl, parent); if (!rule.ok) { alert(rule.err); return; }

      pushHistory();
      const newNode = { id: uid(), name: key.name || nm, type, parentId: parent ? parent.id : null, level: type === "Subsystem" ? lvl : null, createdAt: Date.now() };
      setNodes((prev) => [newNode, ...prev]);
      // Clear fields (UI behavior): Name always; Level only if type ≠ Subsystem; Type is kept
      setName(""); if (type !== "Subsystem") setSubsystemLevel("");
    } catch (err) { alert("Failed to add node: " + (err && err.message ? err.message : String(err))); }
  }

  function beginEdit(n) { setPendingDeleteId(""); setEditingId(n.id); setEditName(n.name); setEditType(n.type); setEditParentId(n.parentId || ""); setEditLevel(n.type === "Subsystem" && n.level != null ? String(n.level) : ""); }
  function cancelEdit() { setEditingId(""); setEditName(""); setEditType("System"); setEditParentId(""); setEditLevel(""); }
  const editBlockedIds = useMemo(() => (editingId ? new Set(getDescendantIds(editingId, nodes)) : new Set()), [editingId, nodes]);
  function saveEdit() {
    if (!editingId) return;
    let nm = editName.trim(); if (!nm) { alert("Name is required"); return; }

    // Single System rule on edit
    if (editType === 'System') {
      const otherSystem = nodes.find(n=>n.type==='System' && n.id!==editingId);
      if (otherSystem) { alert('Only one System is allowed. Change Type or delete the other System first.'); return; }
    }

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

    const dupe = findDuplicateNode(nodes, { id:editingId, name:nm, type:newType, level:lvl, parentId:newType==='System'? null : (newParentId||null) }, editingId);
    if (dupe) {
      const indexIt = confirm(`Duplicate detected. For edits, only indexing is supported to preserve IDs.\n\nOK = Use indexed name (e.g., ${nm}(1))\nCancel = Abort save`);
      if (!indexIt) return; // abort
      const siblings = nodes.filter(x=>{
        if (String(x.type) !== String(newType)) return false;
        if (String(x.parentId || '') !== String(newParentId || '')) return false;
        if (newType==='Subsystem' && Number(x.level)!==Number(lvl)) return false;
        return true;
      }).map(x=>x.name);
      nm = nextIndexedName(nm, siblings);
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
  function confirmDelete() {
    if (!pendingDeleteId) return;
    const delIds = new Set(getDescendantIds(pendingDeleteId, nodes));
    const target = nodes.find(n => n.id === pendingDeleteId) || null;
    const hasChildren = delIds.size > 1;
    if (hasChildren) {
      const ok = window.confirm(
        `Warning: "${target ? target.name : 'This node'}" has ${delIds.size - 1} descendant node(s).` +
        `\nDeleting will remove them all.\n\nAre you sure?`
      );
      if (!ok) { setPendingDeleteId(""); return; }
    }
    pushHistory();
    setNodes((prev) => prev.filter((a) => !delIds.has(a.id)));
    setPendingDeleteId("");
  }

  // ---- Utilities ----
  function clearAll() {
    const ok = confirm("Clear all data? This cannot be undone.");
    if (!ok) return;
    const typed = (prompt('Type "CLEAR" to confirm') || '').trim().toUpperCase();
    if (typed !== 'CLEAR') { alert('Cancelled. Data not cleared.'); return; }
    pushHistory();
    try {
      localStorage.removeItem(LS_KEY);
      try { LEGACY_KEYS.forEach((k) => localStorage.removeItem(k)); } catch {}
    } catch {}
    setNodes([]);
    setCollapsedIds(new Set());
    alert('All data cleared.');
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

  // Export CSV
  async function exportCSV() {
    try {
      const header = ['Name','Type','Level','ParentName','ParentID','ID','CreatedISO'];
      const rows = nodes.map(n => {
        const p = byId.get(n.parentId || '') || null;
        return [n.name, n.type, n.type==='Subsystem' && n.level!=null ? n.level : '', p ? p.name : '', n.parentId || '', n.id, new Date(n.createdAt).toISOString()];
      });
      const csv = [header, ...rows].map(r => r.map(v => {
        const s = String(v == null ? '' : v);
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
      }).join(',')).join('\n');
      const suggested = "module1_assets_" + new Date().toISOString().replace(/[:.]/g, "-") + ".csv";

      // Save Picker
      try {
        if (self.isSecureContext && typeof window.showSaveFilePicker === 'function') {
          const handle = await window.showSaveFilePicker({ suggestedName: suggested, types: [{ description: 'CSV', accept: { 'text/csv': ['.csv'] } }], startIn: 'downloads' });
          const writable = await handle.createWritable(); await writable.write(new Blob([csv], { type: 'text/csv' })); await writable.close(); return;
        }
      } catch (e) { if (e && (e.name === 'AbortError' || e.name === 'NotAllowedError')) return; }

      // Object URL fallback
      try {
        const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.style.display='none'; a.href=url; a.download=suggested; document.body.appendChild(a);
        a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        setTimeout(()=>{ try{ document.body.removeChild(a); URL.revokeObjectURL(url);}catch{} }, 1500);
        return;
      } catch(e2) {}

      // New tab fallback
      try { const w = window.open('', '_blank'); if (w) { w.document.open(); w.document.write('<pre>'+csv.replace(/[&<>]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[s]))+'</pre>'); w.document.close(); return; } } catch(e3) {}
      alert('Export CSV failed.');
    } catch(err) { alert('Export CSV error: ' + (err && err.message ? err.message : String(err))); }
  }

  function importJSON(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const reader = new FileReader();
    reader.onload = () => { try {
      const parsed = JSON.parse(String(reader.result)); if (!Array.isArray(parsed)) throw new Error("Unknown format");
      const sanitized = parsed.filter((x) => x && x.id && x.name && x.type).map((x) => ({ id: String(x.id), name: String(x.name), type: x.type === "System" || x.type === "Subsystem" || x.type === "Component" ? x.type : "Component", parentId: x.parentId ? String(x.parentId) : null, level: x.type === "Subsystem" && Number.isFinite(Number(x.level)) ? Math.max(1, Number(x.level)) : (x.type === "Subsystem" ? 1 : null), createdAt: Number(x.createdAt) || Date.now() }));

      pushHistory();
      setNodes((prev) => {
        const map = new Map(prev.map(i=>[i.id, i]));
        if (importPolicy === 'update') {
          sanitized.forEach(item => { const ex = map.get(item.id); if (!ex || Number(item.createdAt) > Number(ex.createdAt)) { map.set(item.id, item); } });
          return Array.from(map.values());
        } else { // 'skip'
          const toAdd = sanitized.filter(item => !map.has(item.id));
          return [...prev, ...toAdd];
        }
      });
      e.target.value = "";
    } catch (err) { alert("Import failed: " + (err && err.message ? err.message : String(err))); } };
    reader.readAsText(f);
  }

  // Collapse/expand helpers
  const toggleCollapse = (id) => setCollapsedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const expandAll = () => setCollapsedIds(new Set());
  const collapseAll = () => { const ids = new Set(getAllWithChildrenIds(tree)); setCollapsedIds(ids); };

  // ---- Render ----
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-6">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-3">
          <h1 className="text-2xl font-bold tracking-tight">Module 1 – Asset Registry & Hierarchy (Clean Build v7.13.7)</h1>
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
                <option value="System" disabled={hasSystem}>System{hasSystem?' (already exists)':''}</option>
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
              <Button onClick={addNode}>Add</Button>
              <Button className="bg-white text-rose-700 border-rose-300" onClick={clearAll}>Clear All</Button>
            </div>
          </div>
        </Card>

        {/* Table */}
        <Card className={`p-5 lg:col-span-2 ${activeTab==='table' ? 'block' : 'hidden'} lg:block`}>
          <div className="mb-3">
            <SectionTitle>Asset Table</SectionTitle>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              {/* Filters */}
              <Select value={typeFilter} onChange={(e)=>{ setTypeFilter(e.target.value); if (e.target.value!== 'Subsystem') setLevelFilter('All'); }} className="w-36">
                <option value="All">All Types</option>
                <option value="System">System</option>
                <option value="Subsystem">Subsystem</option>
                <option value="Component">Component</option>
              </Select>
              <Select value={levelFilter} onChange={(e)=>setLevelFilter(e.target.value)} disabled={typeFilter!=='Subsystem'} className="w-32">
                <option value="All">All Levels</option>
                {levelOptions.map(l=>(<option key={l} value={String(l)}>L{l}</option>))}
              </Select>

              <div className="w-64 md:w-80 lg:w-96">
                <TextInput placeholder="Search name/type/ID…" value={filter} onChange={(e) => setFilter(e.target.value)} />
              </div>

              <Button className="bg-white text-slate-700 border-slate-300" onClick={exportJSON}>Export JSON</Button>
              <Button className="bg-white text-slate-700 border-slate-300" onClick={exportCSV}>Export CSV</Button>
              <label className="cursor-pointer inline-block">
                <span className="rounded-xl px-3 py-1.5 text-sm border border-slate-300 bg-white">Import JSON</span>
                <input type="file" accept="application/json" className="hidden" onChange={importJSON} />
              </label>
              <Select value={importPolicy} onChange={(e)=>setImportPolicy(e.target.value)} className="w-44">
                <option value="skip">Import: Skip duplicates</option>
                <option value="update">Import: Update if newer</option>
              </Select>

              {/* Desktop tree quick toggle */}
              <Button className="bg-white text-slate-700 border-slate-300 hidden lg:inline-block" onClick={()=>setShowTree(s=>!s)}>
                {showTree ? 'Hide Tree' : 'Show Tree'}
              </Button>
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
                    <td className="p-2">{(byId.get(n.parentId || '') || {}).name || "—"}</td>
                    <td className="p-2 font-mono text-xs">{n.id}</td>
                    <td className="p-2">{new Date(n.createdAt).toLocaleString()}</td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <Button className="bg-white text-slate-700 border-slate-300" onClick={() => beginEdit(n)}>Edit</Button>
                        {pendingDeleteId === n.id ? (
                          <>
                            <Button className="bg-white text-rose-700 border-rose-300" onClick={confirmDelete}>Confirm Delete?</Button>
                            <Button className="bg-white text-slate-700 border-slate-300" onClick={cancelDelete}>Cancel</Button>
                          </>
                        ) : (
                          <Button className="bg-white text-rose-700 border-rose-300" onClick={() => askDelete(n)}>Delete</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td className="p-4 text-center text-slate-500" colSpan={7}>No data yet</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Mobile tabs */}
          <div className="lg:hidden mt-3 flex gap-2">
            <Button className={`bg-white border-slate-300 text-slate-700 ${activeTab==='table'?'ring-1 ring-indigo-400':''}`} onClick={()=>setActiveTab('table')}>Assets</Button>
            <Button className={`bg-white border-slate-300 text-slate-700 ${activeTab==='tree'?'ring-1 ring-indigo-400':''}`} onClick={()=>setActiveTab('tree')}>Hierarchy</Button>
          </div>
        </Card>

        {/* Hierarchy */}
        {showTree && (
          <Card className={`p-5 lg:col-span-3 ${activeTab==='tree' ? 'block' : 'hidden'} lg:block`}>
            <div className="flex items-center justify-between mb-3">
              <SectionTitle>System Hierarchy (Graphical)</SectionTitle>
              <div className="flex items-center gap-2">
                <Button className="bg-white text-slate-700 border-slate-300" onClick={collapseAll}>Collapse All</Button>
                <Button className="bg-white text-slate-700 border-slate-300" onClick={expandAll}>Expand All</Button>
                <Button className="bg-white text-slate-700 border-slate-300" onClick={()=>setTreeFullscreen(true)}>Full Screen</Button>
                <Button className="bg-white text-slate-700 border-slate-300 hidden lg:inline-block" onClick={()=>setShowTree(false)}>Hide</Button>
              </div>
            </div>
            {tree.length === 0 ? (
              <p className="text-slate-500">No nodes yet. Add a System first, then Subsystems/Components.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">Hierarchy Tree</h3>
                  <Tree nodes={tree} collapsedIds={collapsedIds} onToggle={toggleCollapse} />
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Notes</h3>
                  <ul className="text-sm list-disc pl-5 space-y-1 text-slate-700">
                    <li><b>System</b>: top/root level (e.g., Trainset, Depot System). Only one System allowed per project.</li>
                    <li><b>Subsystem</b>: parts under System (e.g., Propulsion, Brake). <i>Level</i> starts at 1.</li>
                    <li><b>Component</b>: smallest maintainable unit (e.g., Traction Inverter, Master Controller).</li>
                  </ul>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Fullscreen Tree modal */}
        {treeFullscreen ? (
          <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
            <div className="bg-white shadow-md p-3 flex items-center justify-between">
              <div className="font-semibold">Hierarchy – Full Screen</div>
              <div className="flex gap-2">
                <Button className="bg-white text-slate-700 border-slate-300" onClick={collapseAll}>Collapse All</Button>
                <Button className="bg-white text-slate-700 border-slate-300" onClick={expandAll}>Expand All</Button>
                <Button onClick={()=>setTreeFullscreen(false)}>Close</Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-white p-5">
              {tree.length === 0 ? (<p className="text-slate-500">No nodes yet.</p>) : (<Tree nodes={tree} collapsedIds={collapsedIds} onToggle={toggleCollapse} />)}
            </div>
          </div>
        ) : null}

      </div>
    </div>
  );
}
