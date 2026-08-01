import { useState, useEffect, useRef, useMemo } from "react";
import { Trophy, Plus, Trash2, X, Menu, Settings2, BookOpen, Medal } from "lucide-react";
import { storage } from "./supabaseClient";

const STORAGE_KEY = "liga-fantasy-mister-data-v2";

const COMPS = [
  { id: "premier", label: "Premier League", short: "PL", color: "#7C4DDB", glow: "rgba(124,77,219,0.35)" },
  { id: "laliga", label: "LaLiga", short: "LL", color: "#E0472B", glow: "rgba(224,71,43,0.35)" },
  { id: "champions", label: "Champions League", short: "UCL", color: "#2F5FE0", glow: "rgba(47,95,224,0.35)" },
];

const DIVISIONS = [
  { id: "primera", label: "Primera División" },
  { id: "segunda", label: "Segunda División" },
];

const NAV_ITEMS = [
  { id: "marcador", label: "Marcador", icon: Trophy },
  { id: "reglas", label: "Reglas", icon: BookOpen },
  { id: "palmares", label: "Palmarés", icon: Medal },
];

const RANK_COLOR_OPTIONS = [
  { id: "ninguno", label: "Sin color", hex: null },
  { id: "dorado", label: "Dorado", hex: "#D8AE4F" },
  { id: "rojo", label: "Rojo", hex: "#D9473B" },
  { id: "naranja", label: "Naranja", hex: "#E08934" },
  { id: "rosado", label: "Rosado", hex: "#E0639D" },
];

const defaultData = () => ({
  seasons: [{ id: "apertura26", label: "Apertura 26" }],
  currentSeasonId: "apertura26",
  currentDivisionId: "primera",
  divisionParticipants: { primera: [], segunda: [] },
  leagues: {}, // leagues[seasonId][divisionId] = { scores: {premier:{},laliga:{},champions:{}}, jornadas: {premier:1,laliga:1,champions:1} }
  rules: "",
  rankColors: {
    primera: { 1: "#D8AE4F", 2: "#D9473B", 3: "#E08934", 4: "#E0639D" },
    segunda: { 1: "#D8AE4F", 2: "#D9473B", 3: "#E08934", 4: "#E0639D" },
  },
  palmaresTabs: [{ id: "titulos-pasados", label: "Títulos pasados", entries: [] }],
  currentPalmaresTabId: "titulos-pasados",
  adminPasscode: null,
});

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emptyLeague() {
  return {
    scores: { premier: {}, laliga: {}, champions: {} },
    jornadas: { premier: 1, laliga: 1, champions: 1 },
  };
}

function resizeImageFile(file, maxSize = 96, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        } else if (height >= width && height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => reject(new Error("No se pudo leer la imagen"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function getLeague(data, seasonId, divisionId) {
  return data.leagues?.[seasonId]?.[divisionId] || emptyLeague();
}

export default function App() {
  const [data, setData] = useState(defaultData());
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState("marcador");
  const [menuOpen, setMenuOpen] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const [adminMode, setAdminMode] = useState(false);
  const [showAdminBox, setShowAdminBox] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeInput2, setCodeInput2] = useState("");
  const [adminError, setAdminError] = useState("");
  const [showChangeBox, setShowChangeBox] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newCode2, setNewCode2] = useState("");
  const [changeError, setChangeError] = useState("");
  const [changeDone, setChangeDone] = useState(false);
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [showNewSeason, setShowNewSeason] = useState(false);
  const [newSeasonLabel, setNewSeasonLabel] = useState("");
  const [editComp, setEditComp] = useState("premier");
  const [newName, setNewName] = useState("");
  const saveTimeout = useRef(null);
  const firstLoad = useRef(true);
  const tapCount = useRef(0);
  const tapTimer = useRef(null);

  const handleTitleTap = () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => { tapCount.current = 0; }, 700);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      if (adminMode) {
        setAdminMode(false);
      } else {
        openAdminBox();
      }
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          setData({ ...defaultData(), ...parsed });
        }
      } catch (e) {
        // sin datos todavía
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  // Los espectadores (sin modo admin) refrescan los datos cada 15s
  // para ver cambios que haga el administrador sin recargar la página.
  useEffect(() => {
    if (adminMode) return;
    const interval = setInterval(async () => {
      try {
        const res = await storage.get(STORAGE_KEY);
        if (res && res.value) {
          const parsed = JSON.parse(res.value);
          firstLoad.current = true; // evita que este refresco dispare un guardado
          setData({ ...defaultData(), ...parsed });
        }
      } catch (e) {
        // ignorar errores de refresco silencioso
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [adminMode]);

  useEffect(() => {
    if (!loaded) return;
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    setSaveState("saving");
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      try {
        await storage.set(STORAGE_KEY, JSON.stringify(data));
        setSaveState("saved");
      } catch (e) {
        setSaveState("idle");
      }
    }, 600);
    return () => clearTimeout(saveTimeout.current);
  }, [data, loaded]);

  const openAdminBox = () => {
    setAdminError("");
    setCodeInput("");
    setCodeInput2("");
    setShowAdminBox(true);
  };

  const submitAdmin = () => {
    if (!data.adminPasscode) {
      if (codeInput.trim().length < 4) {
        setAdminError("El código debe tener al menos 4 caracteres.");
        return;
      }
      if (codeInput !== codeInput2) {
        setAdminError("Los códigos no coinciden.");
        return;
      }
      setData((d) => ({ ...d, adminPasscode: codeInput.trim() }));
      setAdminMode(true);
      setShowAdminBox(false);
      return;
    }
    if (codeInput === data.adminPasscode) {
      setAdminMode(true);
      setShowAdminBox(false);
    } else {
      setAdminError("Código incorrecto.");
    }
  };

  const submitChangeCode = () => {
    setChangeError("");
    if (newCode.trim().length < 4) {
      setChangeError("El nuevo código debe tener al menos 4 caracteres.");
      return;
    }
    if (newCode !== newCode2) {
      setChangeError("Los códigos no coinciden.");
      return;
    }
    setData((d) => ({ ...d, adminPasscode: newCode.trim() }));
    setNewCode("");
    setNewCode2("");
    setChangeDone(true);
    setTimeout(() => {
      setChangeDone(false);
      setShowChangeBox(false);
    }, 1200);
  };

  const withLeague = (seasonId, divisionId, updater) => {
    setData((d) => {
      const current = getLeague(d, seasonId, divisionId);
      const updated = updater(current);
      return {
        ...d,
        leagues: {
          ...d.leagues,
          [seasonId]: { ...(d.leagues[seasonId] || {}), [divisionId]: updated },
        },
      };
    });
  };

  const addSeason = () => {
    const label = newSeasonLabel.trim();
    if (!label) return;
    const id = uid();
    setData((d) => ({ ...d, seasons: [...d.seasons, { id, label }], currentSeasonId: id }));
    setNewSeasonLabel("");
    setShowNewSeason(false);
  };

  const removeSeason = (seasonId) => {
    setData((d) => {
      if (d.seasons.length <= 1) return d;
      const remaining = d.seasons.filter((s) => s.id !== seasonId);
      const leagues = { ...d.leagues };
      delete leagues[seasonId];
      return {
        ...d,
        seasons: remaining,
        currentSeasonId: d.currentSeasonId === seasonId ? remaining[0].id : d.currentSeasonId,
        leagues,
      };
    });
  };

  const setRankColor = (divisionId, rank, hex) => {
    setData((d) => ({
      ...d,
      rankColors: {
        ...d.rankColors,
        [divisionId]: { ...(d.rankColors[divisionId] || {}), [rank]: hex },
      },
    }));
  };

  const addParticipant = (divisionId) => {
    const name = newName.trim();
    if (!name) return;
    setData((d) => ({
      ...d,
      divisionParticipants: {
        ...d.divisionParticipants,
        [divisionId]: [...(d.divisionParticipants[divisionId] || []), { id: uid(), name }],
      },
    }));
    setNewName("");
  };

  const removeParticipant = (divisionId, id) => {
    setData((d) => ({
      ...d,
      divisionParticipants: {
        ...d.divisionParticipants,
        [divisionId]: d.divisionParticipants[divisionId].filter((p) => p.id !== id),
      },
    }));
  };

  const updateParticipantLogo = (divisionId, id, logo) => {
    setData((d) => ({
      ...d,
      divisionParticipants: {
        ...d.divisionParticipants,
        [divisionId]: d.divisionParticipants[divisionId].map((p) => (p.id === id ? { ...p, logo } : p)),
      },
    }));
  };

  const setScore = (seasonId, divisionId, comp, participantId, jornada, value) => {
    const v = value === "" ? null : Math.max(0, Number(value));
    withLeague(seasonId, divisionId, (league) => {
      const compScores = { ...league.scores[comp] };
      const pScores = { ...(compScores[participantId] || {}) };
      if (v === null) delete pScores[jornada];
      else pScores[jornada] = v;
      compScores[participantId] = pScores;
      return { ...league, scores: { ...league.scores, [comp]: compScores } };
    });
  };

  const addJornada = (seasonId, divisionId, comp) => {
    withLeague(seasonId, divisionId, (league) => ({
      ...league,
      jornadas: { ...league.jornadas, [comp]: league.jornadas[comp] + 1 },
    }));
  };

  const removeJornada = (seasonId, divisionId, comp) => {
    withLeague(seasonId, divisionId, (league) => {
      if (league.jornadas[comp] <= 1) return league;
      const lastJ = league.jornadas[comp];
      const compScores = {};
      for (const [pid, js] of Object.entries(league.scores[comp])) {
        const copy = { ...js };
        delete copy[lastJ];
        compScores[pid] = copy;
      }
      return { ...league, jornadas: { ...league.jornadas, [comp]: lastJ - 1 }, scores: { ...league.scores, [comp]: compScores } };
    });
  };

  const addPalmaresTab = (label) => {
    const clean = label.trim();
    if (!clean) return;
    const id = uid();
    setData((d) => ({
      ...d,
      palmaresTabs: [...d.palmaresTabs, { id, label: clean, entries: [] }],
      currentPalmaresTabId: id,
    }));
  };

  const removePalmaresTab = (tabId) => {
    setData((d) => {
      if (d.palmaresTabs.length <= 1) return d;
      const remaining = d.palmaresTabs.filter((t) => t.id !== tabId);
      return {
        ...d,
        palmaresTabs: remaining,
        currentPalmaresTabId: d.currentPalmaresTabId === tabId ? remaining[0].id : d.currentPalmaresTabId,
      };
    });
  };

  const addPalmaresEntry = (tabId) => {
    setData((d) => ({
      ...d,
      palmaresTabs: d.palmaresTabs.map((t) =>
        t.id === tabId
          ? { ...t, entries: [...t.entries, { id: uid(), title: "", teamLogo: null, trophyImage: null }] }
          : t
      ),
    }));
  };

  const updatePalmaresEntry = (tabId, entryId, field, value) => {
    setData((d) => ({
      ...d,
      palmaresTabs: d.palmaresTabs.map((t) =>
        t.id === tabId
          ? { ...t, entries: t.entries.map((e) => (e.id === entryId ? { ...e, [field]: value } : e)) }
          : t
      ),
    }));
  };

  const removePalmaresEntry = (tabId, entryId) => {
    setData((d) => ({
      ...d,
      palmaresTabs: d.palmaresTabs.map((t) =>
        t.id === tabId ? { ...t, entries: t.entries.filter((e) => e.id !== entryId) } : t
      ),
    }));
  };

  const currentDivisionId = data.currentDivisionId;
  const currentSeasonId = data.currentSeasonId;
  const currentLeague = getLeague(data, currentSeasonId, currentDivisionId);
  const currentParticipants = data.divisionParticipants[currentDivisionId] || [];

  const totals = useMemo(() => {
    return currentParticipants
      .map((p) => {
        const perComp = {};
        let total = 0;
        for (const c of COMPS) {
          const js = currentLeague.scores[c.id][p.id] || {};
          const sum = Object.values(js).reduce((a, b) => a + b, 0);
          perComp[c.id] = sum;
          total += sum;
        }
        return { ...p, perComp, total };
      })
      .sort((a, b) => b.total - a.total);
  }, [currentParticipants, currentLeague]);

  const maxTotal = Math.max(1, ...totals.map((t) => t.total));

  return (
    <div style={styles.page}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        .lf-root { font-family: 'Inter', sans-serif; }
        .lf-display { font-family: 'Bebas Neue', sans-serif; letter-spacing: 0.03em; }
        .lf-num { font-variant-numeric: tabular-nums; font-feature-settings: "tnum"; }
        .lf-scroll::-webkit-scrollbar { height: 8px; width: 8px; }
        .lf-scroll::-webkit-scrollbar-thumb { background: #2A3630; border-radius: 8px; }
        .lf-tab { transition: all .15s ease; }
        .lf-row:hover { background: rgba(255,255,255,0.03); }
        input.lf-cell::-webkit-inner-spin-button, input.lf-cell::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        .lf-pitch-bg {
          background-image: repeating-linear-gradient(135deg, rgba(255,255,255,0.025) 0px, rgba(255,255,255,0.025) 1px, transparent 1px, transparent 26px);
        }
        textarea.lf-rules:focus, input.lf-input:focus { border-color: #D8AE4F !important; }
      `}</style>

      <div className="lf-root" style={styles.container}>
        {/* Top bar: siempre visible en todas las pestañas */}
        <div style={styles.topBar}>
          <div style={{ position: "relative", justifySelf: "start" }}>
            <button onClick={() => setMenuOpen((v) => !v)} style={styles.menuBtn}>
              <Menu size={20} color="#EDEAE0" />
            </button>

            {menuOpen && (
              <>
                <div style={styles.menuBackdrop} onClick={() => setMenuOpen(false)} />
                <div style={styles.dropdown}>
                  {NAV_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setTab(item.id); setMenuOpen(false); }}
                      style={tab === item.id ? styles.dropdownItemActive : styles.dropdownItem}
                    >
                      <item.icon size={16} />
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div
            className="lf-display"
            style={styles.brandTitle}
            onClick={handleTitleTap}
          >
            FANTASY NOVUM
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, justifySelf: "end" }}>
            {adminMode && (
              <div style={styles.saveBadge}>
                <span style={{ width: 7, height: 7, borderRadius: 99, background: saveState === "saving" ? "#D8AE4F" : "#4CAF6D", display: "inline-block" }} />
                {saveState === "saving" ? "Guardando…" : "Guardado"}
              </div>
            )}
            {adminMode && (
              <button onClick={() => { setChangeError(""); setNewCode(""); setNewCode2(""); setShowChangeBox(true); }} style={styles.changeCodeBtn}>
                Cambiar código
              </button>
            )}
          </div>
        </div>

        {showAdminBox && (
          <div style={styles.adminOverlay} onClick={() => setShowAdminBox(false)}>
            <div style={styles.adminBox} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="lf-display" style={{ fontSize: 20, color: "#EDEAE0" }}>
                  {data.adminPasscode ? "Entrar en modo admin" : "Crear código de administrador"}
                </div>
                <button onClick={() => setShowAdminBox(false)} style={styles.iconBtn}><X size={18} color="#9BA69E" /></button>
              </div>
              {!data.adminPasscode && (
                <p style={{ color: "#9BA69E", fontSize: 13, lineHeight: 1.5 }}>
                  Nadie ha activado el modo admin todavía. Crea un código ahora — solo tú deberías guardarlo.
                </p>
              )}
              <input
                type="password"
                className="lf-input"
                placeholder={data.adminPasscode ? "Código de admin" : "Nuevo código (mín. 4 caracteres)"}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                style={styles.textInput}
              />
              {!data.adminPasscode && (
                <input
                  type="password"
                  className="lf-input"
                  placeholder="Repite el código"
                  value={codeInput2}
                  onChange={(e) => setCodeInput2(e.target.value)}
                  style={styles.textInput}
                />
              )}
              {adminError && <div style={{ color: "#E0725F", fontSize: 12.5 }}>{adminError}</div>}
              <button onClick={submitAdmin} style={styles.primaryBtn}>
                {data.adminPasscode ? "Entrar" : "Crear y entrar"}
              </button>
            </div>
          </div>
        )}

        {showChangeBox && (
          <div style={styles.adminOverlay} onClick={() => setShowChangeBox(false)}>
            <div style={styles.adminBox} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div className="lf-display" style={{ fontSize: 20, color: "#EDEAE0" }}>Cambiar código</div>
                <button onClick={() => setShowChangeBox(false)} style={styles.iconBtn}><X size={18} color="#9BA69E" /></button>
              </div>
              {changeDone ? (
                <div style={{ color: "#4CAF6D", fontSize: 14, fontWeight: 600 }}>Código actualizado ✓</div>
              ) : (
                <>
                  <input
                    type="password"
                    className="lf-input"
                    placeholder="Nuevo código (mín. 4 caracteres)"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    style={styles.textInput}
                  />
                  <input
                    type="password"
                    className="lf-input"
                    placeholder="Repite el nuevo código"
                    value={newCode2}
                    onChange={(e) => setNewCode2(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitChangeCode()}
                    style={styles.textInput}
                  />
                  {changeError && <div style={{ color: "#E0725F", fontSize: 12.5 }}>{changeError}</div>}
                  <button onClick={submitChangeCode} style={styles.primaryBtn}>Guardar nuevo código</button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Contenido */}
        {tab === "marcador" && (
          <MarcadorTab
            data={data}
            setData={setData}
            adminMode={adminMode}
            totals={totals}
            maxTotal={maxTotal}
            currentLeague={currentLeague}
            currentParticipants={currentParticipants}
            showNewSeason={showNewSeason}
            setShowNewSeason={setShowNewSeason}
            newSeasonLabel={newSeasonLabel}
            setNewSeasonLabel={setNewSeasonLabel}
            addSeason={addSeason}
            removeSeason={removeSeason}
            setRankColor={setRankColor}
            showEditPanel={showEditPanel}
            setShowEditPanel={setShowEditPanel}
            editComp={editComp}
            setEditComp={setEditComp}
            newName={newName}
            setNewName={setNewName}
            addParticipant={addParticipant}
            removeParticipant={removeParticipant}
            updateParticipantLogo={updateParticipantLogo}
            setScore={setScore}
            addJornada={addJornada}
            removeJornada={removeJornada}
          />
        )}

        {tab === "reglas" && (
          <RulesTab adminMode={adminMode} rules={data.rules} onChange={(v) => setData((d) => ({ ...d, rules: v }))} />
        )}

        {tab === "palmares" && (
          <PalmaresTab
            data={data}
            setData={setData}
            adminMode={adminMode}
            addPalmaresTab={addPalmaresTab}
            removePalmaresTab={removePalmaresTab}
            addPalmaresEntry={addPalmaresEntry}
            updatePalmaresEntry={updatePalmaresEntry}
            removePalmaresEntry={removePalmaresEntry}
          />
        )}

        <div style={styles.footNote}>
          {adminMode ? "Estás en modo admin: los cambios se guardan y todos los verán." : "Estás viendo la liga en modo lectura."}
        </div>
      </div>
    </div>
  );
}

function MarcadorTab({
  data, setData, adminMode, totals, maxTotal, currentLeague, currentParticipants,
  showNewSeason, setShowNewSeason, newSeasonLabel, setNewSeasonLabel, addSeason, removeSeason, setRankColor,
  showEditPanel, setShowEditPanel, editComp, setEditComp,
  newName, setNewName, addParticipant, removeParticipant, updateParticipantLogo, setScore, addJornada, removeJornada,
}) {
  const activeDivision = DIVISIONS.find((d) => d.id === data.currentDivisionId);
  const activeComp = COMPS.find((c) => c.id === editComp);

  const [confirmDeleteSeason, setConfirmDeleteSeason] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);

  const handleLogoFile = async (participantId, file) => {
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 96, 0.82);
      updateParticipantLogo(data.currentDivisionId, participantId, dataUrl);
    } catch (e) {
      // si falla la lectura de la imagen, no hacemos nada
    }
  };

  return (
    <>
      {/* Selector de temporada */}
      <div style={styles.selectorRow}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {data.seasons.map((s) => (
            <button
              key={s.id}
              onClick={() => setData((d) => ({ ...d, currentSeasonId: s.id }))}
              style={data.currentSeasonId === s.id ? styles.seasonBtnActive : styles.seasonBtn}
            >
              {s.label}
            </button>
          ))}
          {adminMode && !showNewSeason && (
            <button onClick={() => setShowNewSeason(true)} style={styles.seasonBtnGhost}>
              <Plus size={13} /> Temporada
            </button>
          )}
          {adminMode && showNewSeason && (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                autoFocus
                className="lf-input"
                placeholder='Ej. "Clausura 27"'
                value={newSeasonLabel}
                onChange={(e) => setNewSeasonLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSeason()}
                style={{ ...styles.textInput, width: 160, padding: "8px 12px" }}
              />
              <button onClick={addSeason} style={styles.primaryBtnSmall}>Crear</button>
            </div>
          )}
        </div>
        {adminMode && data.seasons.length > 1 && (
          confirmDeleteSeason ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ color: "#9BA69E", fontSize: 12 }}>¿Eliminar esta temporada y todos sus puntajes?</span>
              <button
                onClick={() => { removeSeason(data.currentSeasonId); setConfirmDeleteSeason(false); }}
                style={styles.confirmDeleteBtn}
              >
                Sí, eliminar
              </button>
              <button onClick={() => setConfirmDeleteSeason(false)} style={styles.cancelDeleteBtn}>
                Cancelar
              </button>
            </div>
          ) : (
            <button onClick={() => setConfirmDeleteSeason(true)} style={styles.deleteSeasonBtn}>
              Eliminar temporada "{data.seasons.find((s) => s.id === data.currentSeasonId)?.label}"
            </button>
          )
        )}
      </div>

      {/* Selector de división */}
      <div style={styles.divisionRow}>
        {DIVISIONS.map((div) => (
          <button
            key={div.id}
            onClick={() => setData((d) => ({ ...d, currentDivisionId: div.id }))}
            style={data.currentDivisionId === div.id ? styles.divisionBtnActive : styles.divisionBtn}
          >
            {div.label}
          </button>
        ))}
      </div>

      {/* Tabla general */}
      <div style={styles.panel} className="lf-pitch-bg">
        <div style={styles.panelHeadRow}>
          <div className="lf-display" style={{ fontSize: 22, color: "#EDEAE0" }}>
            Marcador General · {activeDivision.label}
          </div>
          <div style={styles.legendRow}>
            {COMPS.map((c) => (
              <span key={c.id} style={styles.legendItem}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: c.color, display: "inline-block" }} />
                {c.short}
              </span>
            ))}
          </div>
        </div>

        {currentParticipants.length === 0 ? (
          <div style={{ color: "#9BA69E", fontSize: 14, marginTop: 18 }}>
            {adminMode ? "Añade místers a esta división desde el panel de edición." : "El admin todavía no ha cargado místers en esta división."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 18 }}>
            {totals.map((t, i) => {
              const gap = i > 0 ? totals[i - 1].total - t.total : 0;
              return (
                <div key={t.id} className="lf-row" style={styles.leaderRow}>
                  <div style={{ ...styles.rankBadge, background: (data.rankColors[data.currentDivisionId] || {})[i + 1] || "#1F2A25", color: (data.rankColors[data.currentDivisionId] || {})[i + 1] ? "#0A1210" : "#9BA69E" }}>
                    {i + 1}
                  </div>
                  <div style={styles.crestAvatar}>
                    {t.logo ? (
                      <img src={t.logo} alt={t.name} style={styles.crestImg} />
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 800, color: "#9BA69E" }}>
                        {t.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontWeight: 700, color: "#EDEAE0", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {t.name}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="lf-num lf-display" style={{ fontSize: 24, color: "#EDEAE0", lineHeight: 1 }}>
                          {t.total} <span style={{ fontSize: 12, fontFamily: "Inter", color: "#9BA69E", letterSpacing: 0 }}>pts</span>
                        </div>
                        {gap > 0 && (
                          <div className="lf-num" style={styles.gapText}>−{gap}</div>
                        )}
                      </div>
                    </div>
                    <div style={styles.stackBar}>
                      {COMPS.map((c) => {
                        const pct = t.total > 0 ? (t.perComp[c.id] / maxTotal) * 100 : 0;
                        return <div key={c.id} title={`${c.label}: ${t.perComp[c.id]} pts`} style={{ width: `${pct}%`, background: c.color, height: "100%" }} />;
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Panel de administración (solo visible en modo admin) */}
      {adminMode && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setShowEditPanel((v) => !v)} style={styles.editToggleBtn}>
              <Settings2 size={14} /> {showEditPanel ? "Ocultar edición de datos" : "Editar puntajes y místers"}
            </button>
            <button onClick={() => setShowColorPanel((v) => !v)} style={styles.editToggleBtn}>
              <Settings2 size={14} /> {showColorPanel ? "Ocultar colores de puestos" : "Colores de puestos"}
            </button>
          </div>

          {showColorPanel && (
            <div style={styles.panel}>
              <div className="lf-display" style={{ fontSize: 18, color: "#EDEAE0", marginBottom: 14 }}>
                Color de los primeros puestos · {activeDivision.label}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {currentParticipants.length === 0 && (
                  <div style={{ color: "#9BA69E", fontSize: 13.5 }}>Agrega místers primero para poder asignarles color.</div>
                )}
                {currentParticipants.map((_, idx) => {
                  const rank = idx + 1;
                  const divisionColors = data.rankColors[data.currentDivisionId] || {};
                  return (
                    <div key={rank} style={styles.rankColorRow}>
                      <div style={{ ...styles.rankBadge, background: divisionColors[rank] || "#1F2A25", color: divisionColors[rank] ? "#0A1210" : "#9BA69E", width: 26, height: 26, fontSize: 12 }}>
                        {rank}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {RANK_COLOR_OPTIONS.map((opt) => {
                          const isActive = opt.hex === null ? !divisionColors[rank] : divisionColors[rank] === opt.hex;
                          return (
                            <button
                              key={opt.id}
                              onClick={() => setRankColor(data.currentDivisionId, rank, opt.hex)}
                              title={opt.label}
                              style={{
                                ...styles.swatchBtn,
                                background: opt.hex || "#1B2521",
                                borderStyle: opt.hex ? "solid" : "dashed",
                                outline: isActive ? "2px solid #EDEAE0" : "none",
                                outlineOffset: 2,
                              }}
                            >
                              {!opt.hex && <span style={styles.noColorMark}>✕</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {showEditPanel && (
            <div style={{ ...styles.panel, marginTop: 12 }}>
              <div className="lf-display" style={{ fontSize: 18, color: "#EDEAE0", marginBottom: 10 }}>
                Místers de {activeDivision.label}
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                <input
                  className="lf-input"
                  placeholder="Nombre del amigo/a"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addParticipant(data.currentDivisionId)}
                  style={styles.textInput}
                />
                <button onClick={() => addParticipant(data.currentDivisionId)} style={styles.primaryBtn}>
                  <Plus size={16} /> Añadir
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                {currentParticipants.map((p) => (
                  <div key={p.id} className="lf-row" style={styles.participantRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <label style={styles.logoUploadLabel}>
                        {p.logo ? (
                          <img src={p.logo} alt={p.name} style={styles.crestImgSmall} />
                        ) : (
                          <span style={{ fontSize: 10, color: "#5C6862", fontWeight: 700 }}>LOGO</span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleLogoFile(p.id, e.target.files?.[0])}
                          style={{ display: "none" }}
                        />
                      </label>
                      <span style={{ color: "#EDEAE0", fontWeight: 600 }}>{p.name}</span>
                    </div>
                    <button onClick={() => removeParticipant(data.currentDivisionId, p.id)} style={styles.iconBtn}>
                      <Trash2 size={15} color="#C97A6D" />
                    </button>
                  </div>
                ))}
                {currentParticipants.length === 0 && <div style={{ color: "#9BA69E", fontSize: 13.5 }}>Todavía no hay místers.</div>}
              </div>

              <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {COMPS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setEditComp(c.id)}
                    style={editComp === c.id ? { ...styles.compTabActive, background: c.color } : styles.compTabInactive}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 10 }}>
                <button onClick={() => removeJornada(data.currentSeasonId, data.currentDivisionId, editComp)} style={styles.smallBtn}>− Jornada</button>
                <button
                  onClick={() => addJornada(data.currentSeasonId, data.currentDivisionId, editComp)}
                  style={{ ...styles.smallBtn, background: activeComp.color, color: "#fff", borderColor: activeComp.color }}
                >
                  <Plus size={13} /> Jornada
                </button>
              </div>

              <div style={{ overflowX: "auto" }} className="lf-scroll">
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 420 + currentLeague.jornadas[editComp] * 64 }}>
                  <thead>
                    <tr>
                      <th style={styles.thName}>Míster</th>
                      {Array.from({ length: currentLeague.jornadas[editComp] }, (_, i) => i + 1).map((j) => (
                        <th key={j} style={styles.thJornada}>J{j}</th>
                      ))}
                      <th style={styles.thTotal}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentParticipants.map((p) => {
                      const pScores = currentLeague.scores[editComp][p.id] || {};
                      const sum = Object.values(pScores).reduce((a, b) => a + b, 0);
                      return (
                        <tr key={p.id} className="lf-row">
                          <td style={styles.tdName}>{p.name}</td>
                          {Array.from({ length: currentLeague.jornadas[editComp] }, (_, i) => i + 1).map((j) => (
                            <td key={j} style={styles.tdCell}>
                              <input
                                type="number"
                                className="lf-cell lf-num"
                                value={pScores[j] ?? ""}
                                placeholder="—"
                                onChange={(e) => setScore(data.currentSeasonId, data.currentDivisionId, editComp, p.id, j, e.target.value)}
                                style={styles.cellInput}
                              />
                            </td>
                          ))}
                          <td className="lf-num" style={styles.tdTotal}>{sum}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function RulesTab({ adminMode, rules, onChange }) {
  return (
    <div style={styles.panel}>
      <div className="lf-display" style={styles.bigTitle}>REGLAS</div>
      {adminMode ? (
        <textarea
          className="lf-rules"
          value={rules}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Escribe aquí las reglas de la liga, por ejemplo:\n\n1. Cada jornada suma los puntos de Mister en las tres competiciones.\n2. En caso de empate en el total, gana quien tenga más puntos en Champions.\n3. El último de la general paga la cena de fin de temporada."}
          style={styles.textarea}
        />
      ) : rules.trim() ? (
        <div style={styles.rulesView}>{rules}</div>
      ) : (
        <div style={{ color: "#9BA69E", fontSize: 14 }}>El admin todavía no ha escrito las reglas.</div>
      )}
    </div>
  );
}

function PalmaresTab({ data, setData, adminMode, addPalmaresTab, removePalmaresTab, addPalmaresEntry, updatePalmaresEntry, removePalmaresEntry }) {
  const [showNewTab, setShowNewTab] = useState(false);
  const [newTabLabel, setNewTabLabel] = useState("");

  const activeTab = data.palmaresTabs.find((t) => t.id === data.currentPalmaresTabId) || data.palmaresTabs[0];

  const handleImage = async (entryId, field, file) => {
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(file, 140, 0.85);
      updatePalmaresEntry(activeTab.id, entryId, field, dataUrl);
    } catch (e) {
      // si falla la lectura de la imagen, no hacemos nada
    }
  };

  return (
    <div style={styles.panel}>
      <div className="lf-display" style={styles.bigTitle}>PALMARÉS</div>

      {/* Selector de sub-pestañas */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20, justifyContent: "center" }}>
        {data.palmaresTabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setData((d) => ({ ...d, currentPalmaresTabId: t.id }))}
            style={t.id === activeTab.id ? styles.seasonBtnActive : styles.seasonBtn}
          >
            {t.label}
          </button>
        ))}
        {adminMode && !showNewTab && (
          <button onClick={() => setShowNewTab(true)} style={styles.seasonBtnGhost}>
            <Plus size={13} /> Pestaña
          </button>
        )}
        {adminMode && showNewTab && (
          <div style={{ display: "flex", gap: 6 }}>
            <input
              autoFocus
              className="lf-input"
              placeholder='Ej. "Apertura 26"'
              value={newTabLabel}
              onChange={(e) => setNewTabLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { addPalmaresTab(newTabLabel); setNewTabLabel(""); setShowNewTab(false); }
              }}
              style={{ ...styles.textInput, width: 160, padding: "8px 12px" }}
            />
            <button
              onClick={() => { addPalmaresTab(newTabLabel); setNewTabLabel(""); setShowNewTab(false); }}
              style={styles.primaryBtnSmall}
            >
              Crear
            </button>
          </div>
        )}
      </div>

      {adminMode && data.palmaresTabs.length > 1 && (
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <button onClick={() => removePalmaresTab(activeTab.id)} style={styles.deleteTabBtn}>
            Eliminar pestaña "{activeTab.label}"
          </button>
        </div>
      )}

      {/* Entradas */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {activeTab.entries.map((entry) => (
          <div key={entry.id} style={styles.palmaresCard}>
            {adminMode ? (
              <>
                <button onClick={() => removePalmaresEntry(activeTab.id, entry.id)} style={styles.palmaresDeleteBtn}>
                  <Trash2 size={16} color="#C97A6D" />
                </button>
                <input
                  className="lf-input"
                  placeholder='Ej. "Campeón Premier League: Carlos"'
                  value={entry.title}
                  onChange={(e) => updatePalmaresEntry(activeTab.id, entry.id, "title", e.target.value)}
                  style={{ ...styles.textInput, marginBottom: 16, textAlign: "center" }}
                />
                <div style={{ display: "flex", gap: 18, alignItems: "center", justifyContent: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <label style={styles.imageUploadBox}>
                      {entry.teamLogo ? <img src={entry.teamLogo} alt="logo" style={styles.crestImgSmall} /> : <span style={styles.imageUploadHint}>Logo<br />equipo</span>}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleImage(entry.id, "teamLogo", e.target.files?.[0])} />
                    </label>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <label style={styles.imageUploadBox}>
                      {entry.trophyImage ? <img src={entry.trophyImage} alt="trofeo" style={styles.crestImgSmall} /> : <span style={styles.imageUploadHint}>Trofeo</span>}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => handleImage(entry.id, "trophyImage", e.target.files?.[0])} />
                    </label>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={styles.palmaresCardTitle}>{entry.title || "—"}</div>
                <div style={{ display: "flex", gap: 18, justifyContent: "center" }}>
                  {entry.teamLogo && <img src={entry.teamLogo} alt="logo" style={styles.crestImgLarge} />}
                  {entry.trophyImage && <img src={entry.trophyImage} alt="trofeo" style={styles.crestImgLargeTrophy} />}
                </div>
              </>
            )}
          </div>
        ))}
        {activeTab.entries.length === 0 && (
          <div style={{ color: "#9BA69E", fontSize: 14, textAlign: "center" }}>
            {adminMode ? "Todavía no hay títulos en esta pestaña." : "Todavía no hay títulos registrados aquí."}
          </div>
        )}
      </div>

      {adminMode && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button onClick={() => addPalmaresEntry(activeTab.id)} style={styles.primaryBtn}>
            <Plus size={16} /> Añadir título
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  page: { minHeight: "100vh", background: "#0A1210", padding: "28px 16px", display: "flex", justifyContent: "center" },
  container: { width: "100%", maxWidth: 880 },
  topBar: { display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", marginBottom: 22, gap: 12 },
  menuBtn: { background: "#131C19", border: "1px solid #223028", borderRadius: 10, width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 },
  menuBackdrop: { position: "fixed", inset: 0, zIndex: 40 },
  dropdown: { position: "absolute", top: 46, left: 0, background: "#131C19", border: "1px solid #223028", borderRadius: 12, padding: 6, display: "flex", flexDirection: "column", gap: 2, zIndex: 41, minWidth: 180, boxShadow: "0 12px 30px rgba(0,0,0,0.45)" },
  dropdownItem: { display: "flex", alignItems: "center", gap: 10, background: "transparent", color: "#C7CCC5", border: "none", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 600, cursor: "pointer", textAlign: "left" },
  dropdownItemActive: { display: "flex", alignItems: "center", gap: 10, background: "#D8AE4F", color: "#0A1210", border: "none", borderRadius: 8, padding: "10px 12px", fontSize: 14, fontWeight: 700, cursor: "pointer", textAlign: "left" },
  brandTitle: { fontSize: 34, color: "#EDEAE0", userSelect: "none", WebkitUserSelect: "none", cursor: "default", justifySelf: "center", whiteSpace: "nowrap" },
  saveBadge: { display: "flex", alignItems: "center", gap: 7, color: "#9BA69E", fontSize: 12.5, border: "1px solid #2A3630", borderRadius: 99, padding: "6px 12px" },
  changeCodeBtn: { background: "transparent", color: "#5C6862", border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  adminBtn: { display: "flex", alignItems: "center", gap: 6, background: "#131C19", color: "#9BA69E", border: "1px solid #223028", borderRadius: 99, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  adminBtnActive: { display: "flex", alignItems: "center", gap: 6, background: "#D8AE4F", color: "#0A1210", border: "none", borderRadius: 99, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  adminOverlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 },
  adminBox: { background: "#111A17", border: "1px solid #223028", borderRadius: 16, padding: 22, width: "100%", maxWidth: 340, display: "flex", flexDirection: "column", gap: 12 },
  selectorRow: { marginBottom: 12 },
  deleteSeasonBtn: { background: "transparent", color: "#8A5A50", border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline", marginTop: 8 },
  confirmDeleteBtn: { background: "#C0392B", color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11.5, fontWeight: 700, cursor: "pointer" },
  cancelDeleteBtn: { background: "transparent", color: "#9BA69E", border: "1px solid #2A3630", borderRadius: 8, padding: "6px 12px", fontSize: 11.5, fontWeight: 600, cursor: "pointer" },
  seasonBtn: { background: "#131C19", color: "#9BA69E", border: "1px solid #223028", borderRadius: 99, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  seasonBtnActive: { background: "#EDEAE0", color: "#0A1210", border: "none", borderRadius: 99, padding: "8px 16px", fontSize: 13, fontWeight: 800, cursor: "pointer" },
  seasonBtnGhost: { display: "flex", alignItems: "center", gap: 4, background: "transparent", color: "#5C6862", border: "1px dashed #2A3630", borderRadius: 99, padding: "8px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  divisionRow: { display: "flex", gap: 8, marginBottom: 18 },
  divisionBtn: { flex: 1, background: "#131C19", color: "#9BA69E", border: "1px solid #223028", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 700, cursor: "pointer" },
  divisionBtnActive: { flex: 1, background: "#D8AE4F", color: "#0A1210", border: "none", borderRadius: 10, padding: "10px 14px", fontSize: 13.5, fontWeight: 800, cursor: "pointer" },
  panel: { background: "#111A17", border: "1px solid #1F2C27", borderRadius: 16, padding: 22 },
  panelHeadRow: { display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 },
  legendRow: { display: "flex", gap: 12 },
  legendItem: { display: "flex", alignItems: "center", gap: 6, color: "#9BA69E", fontSize: 12, fontWeight: 600 },
  leaderRow: { display: "flex", alignItems: "center", gap: 14, padding: "10px 12px", borderRadius: 12 },
  crestAvatar: { width: 34, height: 34, borderRadius: 9, background: "#1B2521", border: "1px solid #263630", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" },
  crestImg: { width: "100%", height: "100%", objectFit: "cover" },
  crestImgSmall: { width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 },
  logoUploadLabel: { width: 34, height: 34, borderRadius: 8, background: "#0D1513", border: "1px dashed #2A3630", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, overflow: "hidden" },
  gapText: { fontSize: 10.5, color: "#6C766F", marginTop: 1, fontWeight: 600 },
  deleteTabBtn: { background: "transparent", color: "#8A5A50", border: "none", fontSize: 11.5, fontWeight: 600, cursor: "pointer", textDecoration: "underline" },
  palmaresCard: { background: "#0D1513", border: "1px solid #1B2521", borderRadius: 14, padding: 22, position: "relative" },
  palmaresDeleteBtn: { position: "absolute", top: 12, right: 12, background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex" },
  palmaresCardTitle: { color: "#EDEAE0", fontWeight: 700, fontSize: 21, marginBottom: 18, textAlign: "center" },
  imageUploadBox: { width: 100, height: 100, borderRadius: 14, background: "#111A17", border: "1px dashed #2A3630", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", overflow: "hidden", flexShrink: 0 },
  imageUploadHint: { fontSize: 11, color: "#5C6862", fontWeight: 700, textAlign: "center", lineHeight: 1.3 },
  crestImgLarge: { width: 110, height: 110, objectFit: "cover", borderRadius: 14, border: "1px solid #263630" },
  crestImgLargeTrophy: { width: 110, height: 110, objectFit: "contain" },
  rankBadge: { width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 },
  stackBar: { display: "flex", height: 5, borderRadius: 99, overflow: "hidden", background: "#1B2521", marginTop: 6 },
  editToggleBtn: { display: "flex", alignItems: "center", gap: 7, background: "transparent", color: "#D8AE4F", border: "1px solid #3A3222", borderRadius: 10, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  rankColorRow: { display: "flex", alignItems: "center", gap: 14 },
  swatchBtn: { width: 30, height: 30, borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  noColorMark: { fontSize: 13, color: "#6C766F", fontWeight: 700, lineHeight: 1 },
  compTabActive: { color: "#fff", border: "none", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 700, cursor: "pointer" },
  compTabInactive: { background: "#0D1513", color: "#9BA69E", border: "1px solid #223028", borderRadius: 8, padding: "7px 13px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  smallBtn: { display: "flex", alignItems: "center", gap: 4, background: "transparent", color: "#EDEAE0", border: "1px solid #2A3630", borderRadius: 8, padding: "7px 12px", fontSize: 12.5, fontWeight: 600, cursor: "pointer" },
  thName: { textAlign: "left", color: "#9BA69E", fontSize: 11.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, padding: "0 10px 10px", position: "sticky", left: 0, background: "#111A17" },
  thJornada: { textAlign: "center", color: "#9BA69E", fontSize: 11.5, fontWeight: 700, padding: "0 6px 10px", minWidth: 56 },
  thTotal: { textAlign: "center", color: "#D8AE4F", fontSize: 11.5, fontWeight: 800, padding: "0 10px 10px", textTransform: "uppercase" },
  tdName: { color: "#EDEAE0", fontWeight: 600, fontSize: 14, padding: "8px 10px", borderTop: "1px solid #1B2521", position: "sticky", left: 0, background: "#111A17", whiteSpace: "nowrap" },
  tdCell: { padding: "6px", borderTop: "1px solid #1B2521", textAlign: "center" },
  tdTotal: { color: "#D8AE4F", fontWeight: 800, fontSize: 15, padding: "8px 10px", borderTop: "1px solid #1B2521", textAlign: "center" },
  cellInput: { width: 52, background: "#0D1513", border: "1px solid #223028", borderRadius: 7, color: "#EDEAE0", textAlign: "center", padding: "6px 4px", fontSize: 13.5, outline: "none" },
  textInput: { flex: 1, background: "#0D1513", border: "1px solid #223028", borderRadius: 9, color: "#EDEAE0", padding: "10px 14px", fontSize: 14, outline: "none" },
  primaryBtn: { display: "flex", alignItems: "center", gap: 6, background: "#D8AE4F", color: "#0A1210", border: "none", borderRadius: 9, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  primaryBtnSmall: { background: "#D8AE4F", color: "#0A1210", border: "none", borderRadius: 9, padding: "0 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" },
  participantRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#0D1513", border: "1px solid #1B2521", borderRadius: 10 },
  iconBtn: { background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex" },
  footNote: { textAlign: "center", color: "#5C6862", fontSize: 11.5, marginTop: 22 },
  bigTitle: { fontSize: 40, color: "#EDEAE0", textAlign: "center", marginBottom: 24 },
  textarea: { width: "100%", minHeight: 220, background: "#0D1513", border: "1px solid #223028", borderRadius: 10, color: "#EDEAE0", padding: 14, fontSize: 14, lineHeight: 1.6, outline: "none", resize: "vertical", fontFamily: "Inter, sans-serif" },
  rulesView: { color: "#DDD9CE", fontSize: 14.5, lineHeight: 1.7, whiteSpace: "pre-wrap" },
};
