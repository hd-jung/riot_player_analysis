const navToggle = document.querySelector(".nav-toggle");
const mainNav = document.querySelector(".main-nav");

if (navToggle && mainNav) {
  navToggle.addEventListener("click", () => {
    const open = mainNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(open));
  });
}

const heroSearch = document.querySelector("#hero-search");
if (heroSearch) {
  heroSearch.addEventListener("submit", (event) => {
    event.preventDefault();
    const riotId = document.querySelector("#hero-riot-id").value.trim();
    if (!riotId.includes("#")) {
      document.querySelector("#hero-riot-id").setCustomValidity("Use GameName#Tag.");
      document.querySelector("#hero-riot-id").reportValidity();
      return;
    }
    const region = document.querySelector("#hero-region").value;
    window.location.href = `/analysis?riot_id=${encodeURIComponent(riotId)}&count=10&region=${encodeURIComponent(region)}`;
  });
}

const GROWTH_HISTORY_KEY = "rift-growth-history:v1";
const PRACTICE_HISTORY_KEY = "rift-practice-history:v1";
const IMPORTED_HISTORY_KEY = "rift-imported-history:v1";

// Remove legacy generated snapshots from browsers that visited an older build.
try {
  const growth = JSON.parse(localStorage.getItem(GROWTH_HISTORY_KEY) || "[]");
  if (Array.isArray(growth)) {
    const liveGrowth = growth.filter((item) => item.source !== "demo");
    localStorage.setItem(GROWTH_HISTORY_KEY, JSON.stringify(liveGrowth));
    const active = localStorage.getItem("rift-active-player")?.toLowerCase();
    if (active && !liveGrowth.some((item) => item.riotId?.toLowerCase() === active)) {
      localStorage.removeItem("rift-active-player");
    }
  }
} catch (_) {
  // Ignore malformed legacy browser state and continue with a clean live flow.
}

const configureHeaderAnalysisCta = (riotId = "", matchCount = null) => {
  const cta = document.querySelector("#header-analysis-cta");
  if (!cta) return;
  let history = [];
  try {
    const saved = JSON.parse(localStorage.getItem(GROWTH_HISTORY_KEY) || "[]");
    history = Array.isArray(saved) ? saved : [];
  } catch (_) {
    history = [];
  }
  const activeId = riotId || localStorage.getItem("rift-active-player") || history.at(-1)?.riotId || "";
  const latest = [...history].reverse().find((item) => item.riotId.toLowerCase() === activeId.toLowerCase());
  if (!latest) return;
  cta.classList.add("returning");
  cta.href = `/analysis?riot_id=${encodeURIComponent(activeId)}&count=${matchCount || latest.games || 10}&refresh=1`;
  cta.innerHTML = 'Re-analyze <span aria-hidden="true">↻</span>';
};

configureHeaderAnalysisCta();

const loadPracticeHistory = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PRACTICE_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
};

const recordPracticeCompletion = (riotId, routineState, day, task, checked) => {
  const block = routineState.startedAt || "current";
  const id = `${riotId.toLowerCase()}|${block}|${day}`;
  let log = loadPracticeHistory().filter((item) => item.id !== id);
  if (checked) {
    log.push({
      id,
      riotId,
      block,
      day,
      task,
      timestamp: routineState.completed[day],
    });
  }
  localStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify(log.slice(-500)));
};

const loadGrowthHistory = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(GROWTH_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
};

const loadImportedHistory = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(IMPORTED_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
};

const saveImportedHistory = (data) => {
  const profile = data.historical_profile;
  if (!profile?.weekly?.length) return;
  const existing = loadImportedHistory().filter((item) => item.riotId.toLowerCase() !== data.riot_id.toLowerCase());
  const rows = profile.weekly.map((week, index) => ({
    id: `${data.riot_id.toLowerCase()}|imported|${week.period}`,
    riotId: data.riot_id,
    timestamp: week.period,
    source: "imported-match-review",
    imported: true,
    games: week.games,
    role: data.summary.favorite_role,
    metrics: {
      win_rate: Number(week.win_rate),
      avg_kda: Number(week.avg_kda),
      avg_cs_min: Number(week.avg_cs_min),
      avg_deaths: Number(week.avg_deaths || data.summary.avg_deaths),
    },
    focus: data.training_plan?.focus_areas?.map((item) => item.title) || [],
    routineCompleted: 0,
    coachNote: `${week.win_rate}% win rate across ${week.games} Riot matches. Review ${data.summary.favorite_role} decisions from this period.`,
    order: index,
  }));
  localStorage.setItem(IMPORTED_HISTORY_KEY, JSON.stringify([...existing, ...rows].slice(-500)));
};

const saveGrowthSnapshot = (data, routine, routineState, force = false) => {
  const history = loadGrowthHistory();
  const metrics = {
    win_rate: Number(data.summary.win_rate),
    avg_kda: Number(data.summary.avg_kda),
    avg_cs_min: Number(data.summary.avg_cs_min),
    avg_deaths: Number(data.summary.avg_deaths),
  };
  const playerRows = history.filter((item) => item.riotId.toLowerCase() === data.riot_id.toLowerCase());
  const latest = playerRows.at(-1);
  const unchanged = latest && JSON.stringify(latest.metrics) === JSON.stringify(metrics);
  const recent = latest && Date.now() - new Date(latest.timestamp).getTime() < 12 * 60 * 60 * 1000;

  if (!force && unchanged && recent) return;
  history.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    riotId: data.riot_id,
    timestamp: new Date().toISOString(),
    source: data.source,
    games: data.summary.games,
    role: data.summary.favorite_role,
    metrics,
    gapScore: Number((data.benchmark.comparisons.reduce((sum, item) => sum + item.gap_score, 0) / data.benchmark.comparisons.length).toFixed(1)),
    focus: routine.focus_areas.map((item) => item.title),
    routineCompleted: Object.keys(routineState.completed || {}).length,
  });
  localStorage.setItem(GROWTH_HISTORY_KEY, JSON.stringify(history.slice(-120)));
  localStorage.setItem("rift-active-player", data.riot_id);
};

const analysisApp = document.querySelector("#analysis-app");

if (analysisApp) {
  const form = document.querySelector("#analysis-search");
  const riotIdInput = document.querySelector("#analysis-riot-id");
  const matchCountInput = document.querySelector("#match-count");
  const regionInput = document.querySelector("#analysis-region");
  const consentInput = document.querySelector("#consent-to-store");

  const escapeHtml = (value) =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");

  const initials = (value) =>
    value
      .split(/[\s_-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase();

  const setLoading = (loading) => {
    document.querySelector("#loading-state").hidden = !loading;
    document.querySelector("#idle-state").hidden = true;
    document.querySelector("#analysis-results").hidden = loading;
    document.querySelector("#error-state").hidden = true;
    const status = document.querySelector("#analysis-status");
    status.classList.toggle("ready", !loading);
    status.querySelector("span").textContent = loading ? "SYNCING" : "SIGNAL READY";
  };

  const showError = (message) => {
    document.querySelector("#loading-state").hidden = true;
    document.querySelector("#idle-state").hidden = true;
    document.querySelector("#analysis-results").hidden = true;
    document.querySelector("#error-state").hidden = false;
    document.querySelector("#error-message").textContent = message;
    const status = document.querySelector("#analysis-status");
    status.classList.remove("ready");
    status.querySelector("span").textContent = "INTERRUPTED";
  };

  const metricCard = (label, value, detail) => `
    <article class="metric-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>`;

    const render = (data, forceSnapshot = false) => {
    const summary = data.summary;
    document.querySelector("#player-name").textContent = data.riot_id;
    document.querySelector("#analysis-subtitle").textContent =
      `${summary.games} ranked matches · ${summary.champion_pool} champions tracked`;
    document.querySelector("#data-source").textContent = data.source.toUpperCase();
    const regionLabel = regionInput.options[regionInput.selectedIndex]?.text || data.routing;
    const analyzedAt = new Intl.DateTimeFormat("en", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(data.analyzed_at));
    const sourceLabel = data.source === "live"
      ? "Live Riot API"
      : data.source === "riot-history-import"
        ? "Imported Riot match history"
        : "Cached Riot data";
    document.querySelector("#data-freshness").textContent =
      `${sourceLabel} · ${regionLabel} · Analyzed ${analyzedAt}` +
      (data.persistence?.status === "saved" ? " · Saved to verified history" : "");
    document.querySelector("#favorite-role").textContent =
      `PRIMARY / ${summary.favorite_role.toUpperCase()}`;

    document.querySelector("#summary-metrics").innerHTML = [
      metricCard("WIN RATE", `${summary.win_rate}%`, `${summary.wins}W · ${summary.losses}L`),
      metricCard("AVERAGE KDA", summary.avg_kda, "Kills + assists per death"),
      metricCard("CS PER MIN", summary.avg_cs_min, `${summary.avg_cs} average CS`),
      metricCard("COMFORT ROLE", summary.favorite_role, `${summary.champion_pool} picks in pool`),
    ].join("");

    const historyPanel = document.querySelector("#history-panel");
    if (data.historical_profile?.match_count) {
      const history = data.historical_profile;
      const shortDate = (value) => new Intl.DateTimeFormat("en", {
        month: "short", day: "numeric", year: "numeric",
      }).format(new Date(value));
      historyPanel.hidden = false;
      document.querySelector("#history-range").textContent = `${shortDate(history.from)} — ${shortDate(history.to)}`;
      document.querySelector("#history-disclaimer").textContent =
        `${history.label}. ${history.match_count} public ranked matches are used as a historical performance profile; this is not past GameLevel PT usage. First analyzed ${analyzedAt}.`;
      document.querySelector("#history-summary").innerHTML = `
        <article><span>MATCHES IMPORTED</span><strong>${history.match_count}</strong></article>
        <article><span>WEEKS OBSERVED</span><strong>${history.weekly.length}</strong></article>`;
      document.querySelector("#history-weeks").innerHTML = history.weekly.slice(-13).map((week) => `
        <article>
          <time>${shortDate(week.period)}</time><span>${week.games} G</span>
          <strong>${week.win_rate}% WR</strong><span>${week.avg_kda} KDA</span><span>${week.avg_cs_min} CS/M</span>
        </article>`).join("");
    } else {
      historyPanel.hidden = true;
    }
    saveImportedHistory(data);

    document.querySelector("#benchmark-cohort").textContent =
      `${data.benchmark.cohort.toUpperCase()} / ${data.benchmark.sample_games} GAMES`;
    document.querySelector("#benchmark-disclaimer").textContent =
      `${data.benchmark.disclaimer} Sample confidence: ${data.benchmark.confidence}.`;
    document.querySelector("#player-comparison").innerHTML = data.benchmark.comparisons
      .map((item) => {
        const ratio = item.key === "avg_deaths"
          ? Math.min((item.target / Math.max(item.player, 0.1)) * 100, 100)
          : Math.min((item.player / Math.max(item.target, 0.1)) * 100, 100);
        return `
          <article class="comparison-item ${item.status}">
            <div><span>${escapeHtml(item.label)}</span><b>${item.status === "focus" ? "TRAIN" : "ON TRACK"}</b></div>
            <div class="comparison-values">
              <strong>${item.player}${escapeHtml(item.unit)}</strong>
              <small>YOU</small>
              <i>→</i>
              <strong>${item.target}${escapeHtml(item.unit)}</strong>
              <small>HIGH-RANK</small>
            </div>
            <div class="comparison-track"><i style="width:${Math.max(ratio, 4)}%"></i></div>
          </article>`;
      })
      .join("");

    const quickSession = data.quick_session;
    document.querySelector("#quick-session-title").textContent = quickSession.title;
    document.querySelector("#quick-session-duration").textContent = `${quickSession.estimated_minutes} MIN`;
    document.querySelector("#quick-session-reason").textContent = quickSession.reason;
    document.querySelector("#quick-session-role").textContent = quickSession.primary_role;
    document.querySelector("#quick-session-pick").textContent = quickSession.primary_pick;
    document.querySelector("#quick-session-focus").textContent = quickSession.focus_label;
    document.querySelector("#quick-session-target").textContent = quickSession.target;
    document.querySelector("#quick-session-steps").innerHTML = quickSession.steps
      .map((step) => `
        <article class="quick-session-step">
          <span class="quick-session-index">${String(step.order).padStart(2, "0")}</span>
          <div>
            <span>${escapeHtml(step.phase)} · ${step.minutes} MIN</span>
            <p>${escapeHtml(step.instruction)}</p>
          </div>
        </article>`)
      .join("");

    const routine = data.training_plan;
    const routineKey = `rift-routine:${data.riot_id.toLowerCase()}`;
    let routineState = { completed: {}, startedAt: new Date().toISOString() };
    try {
      const saved = JSON.parse(localStorage.getItem(routineKey) || "null");
      if (Array.isArray(saved)) {
        saved.forEach((day) => { routineState.completed[day] = null; });
      } else if (saved && typeof saved === "object") {
        routineState = { ...routineState, ...saved, completed: saved.completed || {} };
      }
    } catch (_) {
      routineState = { completed: {}, startedAt: new Date().toISOString() };
    }
    if (data.persistence?.status === "saved") {
      routineState.analysisId = data.persistence.analysis_id;
      routineState.routineToken = data.persistence.routine_token;
    }
    const saveRoutine = () => localStorage.setItem(routineKey, JSON.stringify(routineState));
    const completedDays = () => Object.keys(routineState.completed).map(Number).sort((a, b) => a - b);
    const completedAt = (day) => {
      const stamp = routineState.completed[day];
      if (!stamp) return "Completed";
      return `Completed ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(stamp))}`;
    };
    const updateRoutineState = () => {
      const completed = completedDays();
      const total = routine.schedule.length;
      const percent = Math.round((completed.length / total) * 100);
      let streak = 0;
      while (completed.includes(streak + 1)) streak += 1;
      const next = routine.schedule.find((day) => !completed.includes(day.day));

      document.querySelector("#routine-progress").textContent =
        `${completed.length} / ${total} COMPLETE`;
      document.querySelector("#routine-progress-fill").style.width = `${percent}%`;
      document.querySelector("#routine-percent").textContent = `${percent}%`;
      document.querySelector("#routine-streak").textContent = `${streak} ${streak === 1 ? "DAY" : "DAYS"}`;
      document.querySelector("#routine-retest").textContent = completed.length === total ? "READY" : `${total - completed.length} DAYS`;
      document.querySelector("#next-session").hidden = !next;
      document.querySelector("#routine-celebration").hidden = Boolean(next);

      if (next) {
        document.querySelector("#next-session-kicker").textContent = `DAY ${String(next.day).padStart(2, "0")} · TODAY'S TRAINING`;
        document.querySelector("#next-session-task").textContent = next.task;
        document.querySelector("#next-session-detail").textContent = next.detail;
      }
      document.querySelectorAll(".routine-day").forEach((card) => {
        const day = Number(card.querySelector("input").dataset.routineDay);
        const isComplete = completed.includes(day);
        card.classList.toggle("complete", isComplete);
        card.classList.toggle("current", Boolean(next) && next.day === day);
        card.querySelector(".day-completed-at").textContent = isComplete ? completedAt(day) : "";
      });
    };
    document.querySelector("#routine-title").textContent = routine.title;
    document.querySelector("#routine-role").textContent = routine.primary_role;
    document.querySelector("#routine-pick").textContent = routine.primary_pick;
    document.querySelector("#focus-areas").innerHTML = routine.focus_areas
      .map((item) => `
        <article class="focus-item">
          <span>PRIORITY ${item.priority}</span>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.goal)}</p>
        </article>`)
      .join("");
    document.querySelector("#routine-days").innerHTML = routine.schedule
      .map((day) => {
        const complete = completedDays().includes(day.day);
        return `
        <label class="routine-day ${complete ? "complete" : ""}">
          <input type="checkbox" data-routine-day="${day.day}" ${complete ? "checked" : ""}>
          <span class="day-index">${String(day.day).padStart(2, "0")}</span>
          <span class="day-copy"><strong>${escapeHtml(day.task)}</strong><small>${escapeHtml(day.detail)}</small><em class="day-completed-at">${complete ? completedAt(day.day) : ""}</em></span>
          <span class="day-check">✓</span>
        </label>`;
      })
      .join("");
    document.querySelectorAll("[data-routine-day]").forEach((input) => {
      input.addEventListener("change", () => {
        const day = Number(input.dataset.routineDay);
        if (input.checked) routineState.completed[day] = new Date().toISOString();
        else delete routineState.completed[day];
        recordPracticeCompletion(
          data.riot_id,
          routineState,
          day,
          routine.schedule.find((item) => item.day === day)?.task || "",
          input.checked,
        );
        saveRoutine();
        updateRoutineState();
        if (routineState.analysisId && routineState.routineToken) {
          fetch("/api/routine-completion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              analysis_id: routineState.analysisId,
              routine_token: routineState.routineToken,
              day,
              task: routine.schedule.find((item) => item.day === day)?.task || "Training session",
              checked: input.checked,
            }),
          }).catch(() => {});
        }
      });
    });
    document.querySelector("#complete-next-session").onclick = () => {
      const next = routine.schedule.find((day) => !completedDays().includes(day.day));
      document.querySelector(`[data-routine-day="${next?.day}"]`)?.click();
    };
    document.querySelector("#routine-reanalyze").onclick = () => {
      routineState.retestedAt = new Date().toISOString();
      saveRoutine();
      loadAnalysis(data.riot_id, summary.games, true, true);
    };
    saveRoutine();
    updateRoutineState();
    saveGrowthSnapshot(data, routine, routineState, forceSnapshot);
    configureHeaderAnalysisCta(data.riot_id, summary.games);

    document.querySelector("#role-bars").innerHTML = data.roles
      .map(
        (role) => `
        <div class="role-row">
          <span class="role-name">${escapeHtml(role.role.toUpperCase())}</span>
          <div class="role-track"><i style="width:${Math.max(role.share, 3)}%"></i></div>
          <span class="role-value">${role.share}%</span>
        </div>`
      )
      .join("");

    document.querySelector("#recommendations").innerHTML = data.recommendations
      .map(
        (pick, index) => `
        <div class="recommendation-item">
          <span class="rank">${String(index + 1).padStart(2, "0")}</span>
          <div>
            <strong>${escapeHtml(pick.champion)}</strong>
            <small>${escapeHtml(pick.signal)} · ${pick.avg_kda} KDA</small>
          </div>
          <b>${pick.win_rate}%</b>
        </div>`
      )
      .join("");

    document.querySelector("#champion-count").textContent =
      `${data.champions.length} PICKS`;
    document.querySelector("#champion-table").innerHTML = data.champions
      .map(
        (champion) => `
        <tr>
          <td>
            <div class="champion-cell">
              <span class="champion-initial">${escapeHtml(initials(champion.champion))}</span>
              ${escapeHtml(champion.champion)}
            </div>
          </td>
          <td>${champion.games}</td>
          <td class="${champion.win_rate >= 50 ? "winrate-good" : "winrate-low"}">${champion.win_rate}%</td>
          <td>${champion.avg_kda}</td>
          <td>${champion.avg_cs}</td>
        </tr>`
      )
      .join("");

    document.querySelector("#recent-matches").innerHTML = data.recent_matches
      .map(
        (match) => {
          const playedAt = match.played_at
            ? new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(match.played_at))
            : "Date unavailable in cached record";
          return `
        <article class="match-item ${match.win ? "win" : "loss"}">
          <i class="match-result"></i>
          <div class="match-copy">
            <strong>${escapeHtml(match.champion)}</strong>
            <small>${escapeHtml(playedAt)} · ${escapeHtml(match.coach_note)}</small>
          </div>
          <span>${escapeHtml(match.role.toUpperCase())}</span>
          <span class="match-score">${escapeHtml(match.score)}</span>
          <span>${match.duration} MIN</span>
        </article>`;
        }
      )
      .join("");
  };

  const loadAnalysis = async (riotId, matchCount, refresh = false, forceSnapshot = false) => {
    setLoading(true);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          riot_id: riotId,
          match_count: Number(matchCount),
          routing: regionInput.value,
          consent_to_store: consentInput.checked,
          refresh,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "The analysis could not be completed.");
      }
      render(payload, forceSnapshot);
      setLoading(false);
    } catch (error) {
      showError(error.message);
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const riotId = riotIdInput.value.trim();
    if (!riotId.includes("#")) {
      riotIdInput.setCustomValidity("Use GameName#Tag.");
      riotIdInput.reportValidity();
      return;
    }
    riotIdInput.setCustomValidity("");
    const count = matchCountInput.value;
    const region = regionInput.value;
    window.history.replaceState({}, "", `/analysis?riot_id=${encodeURIComponent(riotId)}&count=${count}&region=${encodeURIComponent(region)}`);
    loadAnalysis(riotId, count, true);
  });

  const refreshOnLoad = new URLSearchParams(window.location.search).get("refresh") === "1";
  if (analysisApp.dataset.riotId.trim()) {
    loadAnalysis(analysisApp.dataset.riotId, analysisApp.dataset.count, refreshOnLoad, refreshOnLoad);
  } else {
    document.querySelector("#loading-state").hidden = true;
    document.querySelector("#idle-state").hidden = false;
    document.querySelector("#player-name").textContent = "Ready when you are";
    document.querySelector("#analysis-subtitle").textContent = "Enter a Riot ID and select the account region to begin.";
    document.querySelector("#data-source").textContent = "WAITING FOR PLAYER";
    const status = document.querySelector("#analysis-status");
    status.classList.add("ready");
    status.querySelector("span").textContent = "READY FOR INPUT";
  }
}

const growthApp = document.querySelector("#growth-app");

if (growthApp) {
  const history = [...loadGrowthHistory(), ...loadImportedHistory()];
  const playerSelect = document.querySelector("#growth-player");
  const profiles = [...new Map(history.map((item) => [item.riotId.toLowerCase(), item.riotId])).values()];
  let activePlayer = localStorage.getItem("rift-active-player") || profiles.at(-1) || "";
  let calendarDate = new Date();

  const escapeGrowthHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const dayKey = (value) => {
    const date = new Date(value);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const routineFor = (riotId) => {
    try {
      const saved = JSON.parse(localStorage.getItem(`rift-routine:${riotId.toLowerCase()}`) || "null");
      if (Array.isArray(saved)) return { completed: Object.fromEntries(saved.map((day) => [day, null])) };
      return saved || { completed: {} };
    } catch (_) {
      return { completed: {} };
    }
  };
  const activitiesFor = (riotId, snapshots) => {
    const activities = {};
    const add = (key, type, detail) => {
      activities[key] ||= { practice: [], analysis: [] };
      activities[key][type].push(detail);
    };
    snapshots.forEach((item) => add(dayKey(item.timestamp), "analysis", item));
    const logged = loadPracticeHistory().filter((item) => item.riotId.toLowerCase() === riotId.toLowerCase());
    if (logged.length) {
      logged.forEach((item) => add(dayKey(item.timestamp), "practice", item));
    } else {
      const routine = routineFor(riotId);
      Object.entries(routine.completed || {}).forEach(([day, stamp]) => {
        const fallback = routine.startedAt || snapshots[0]?.timestamp || new Date().toISOString();
        add(dayKey(stamp || fallback), "practice", { day: Number(day), timestamp: stamp });
      });
    }
    return activities;
  };
  const actualStreak = (activities) => {
    const practiced = new Set(Object.entries(activities).filter(([, value]) => value.practice.length).map(([key]) => key));
    let cursor = new Date();
    let streak = 0;
    while (practiced.has(dayKey(cursor))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  };
  const sparkline = (values, lowerBetter = false) => {
    const width = 260;
    const height = 86;
    if (values.length === 1) return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><circle cx="130" cy="43" r="5" /></svg>`;
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const points = values.map((value, index) => {
      const x = 8 + (index / (values.length - 1)) * (width - 16);
      const normalized = (value - min) / span;
      const y = height - 10 - normalized * (height - 20);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline points="${points}"/><circle cx="${points.split(" ").at(-1).split(",")[0]}" cy="${points.split(" ").at(-1).split(",")[1]}" r="4"/></svg>`;
  };
  const renderCalendar = (activities, onSelect) => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    document.querySelector("#calendar-month").textContent = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(calendarDate);
    const firstOffset = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let index = 0; index < firstOffset; index += 1) cells.push('<span class="calendar-day blank"></span>');
    for (let day = 1; day <= days; day += 1) {
      const key = dayKey(new Date(year, month, day));
      const activity = activities[key];
      const kind = activity ? (activity.practice.length && activity.analysis.length ? "both" : activity.practice.length ? "practice" : "analysis") : "";
      const today = key === dayKey(new Date()) ? " today" : "";
      const activityLabel = activity
        ? `${activity.practice.length} practice, ${activity.analysis.length} analysis`
        : "No saved activity";
      cells.push(`<button type="button" class="calendar-day ${kind}${today}" data-calendar-day="${key}" aria-pressed="false" aria-label="${key}: ${activityLabel}"><span>${day}</span>${activity ? `<i>${activity.practice.length ? `${activity.practice.length}D` : `${activity.analysis.length}A`}</i>` : ""}</button>`);
    }
    document.querySelector("#growth-calendar").innerHTML = cells.join("");
    const buttons = [...document.querySelectorAll("[data-calendar-day]")];
    const showCalendarDetail = (button) => {
      buttons.forEach((item) => {
        item.classList.remove("selected");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("selected");
      button.setAttribute("aria-pressed", "true");

      const key = button.dataset.calendarDay;
      const activity = activities[key];
      const dateLabel = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date(`${key}T12:00:00`));
      const practiceEvents = (activity?.practice || []).map((item) => {
        const completedAt = item.timestamp
          ? new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(item.timestamp))
          : "Saved completion";
        return `<article class="calendar-event"><span class="calendar-event-icon practice">✓</span><div><strong>Day ${item.day || "–"} · ${escapeGrowthHtml(item.task || "Practice routine")}</strong><small>Completed at ${completedAt}</small></div></article>`;
      });
      const analysisEvents = (activity?.analysis || []).map((item) => `
        <article class="calendar-event analysis-event">
          <span class="calendar-event-icon analysis">↗</span>
          <div><strong>${item.imported ? "Imported match review" : `${item.games} match analysis checkpoint`}</strong><small>${escapeGrowthHtml(item.role || "Role not set")} · ${escapeGrowthHtml(item.imported ? "Riot Match-V5 · not service usage" : item.source || "Riot API")}</small></div>
          <div class="calendar-event-metrics"><span>KDA <b>${item.metrics.avg_kda}</b></span><span>CS/M <b>${item.metrics.avg_cs_min}</b></span><span>DEATHS <b>${item.metrics.avg_deaths}</b></span><span>WR <b>${item.metrics.win_rate}%</b></span>${item.coachNote ? `<small class="calendar-event-note">${escapeGrowthHtml(item.coachNote)}</small>` : ""}</div>
        </article>`);
      const badges = [];
      if (practiceEvents.length) badges.push(`<span class="practice">${practiceEvents.length} PRACTICE</span>`);
      if (analysisEvents.length) badges.push(`<span class="analysis">${analysisEvents.length} ANALYSIS</span>`);
      const hasActivity = practiceEvents.length || analysisEvents.length;
      const detail = document.querySelector("#calendar-detail");
      detail.innerHTML = `
        <div class="calendar-detail-head">
          <div><span>SELECTED DATE</span><strong>${dateLabel}</strong></div>
          <div class="calendar-detail-badges">${hasActivity ? badges.join("") : '<span class="empty">NO ACTIVITY</span>'}</div>
        </div>
        <div class="calendar-detail-events">${hasActivity ? [...practiceEvents, ...analysisEvents].join("") : '<p class="calendar-no-activity">No practice or analysis was saved on this date. Choose a highlighted day to review an activity.</p>'}</div>`;
      detail.classList.remove("pulse");
      void detail.offsetWidth;
      detail.classList.add("pulse");
      onSelect?.(key);
    };
    buttons.forEach((button) => button.addEventListener("click", () => showCalendarDetail(button)));

    const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;
    const latestActiveKey = Object.keys(activities).filter((key) => key.startsWith(monthPrefix)).sort().at(-1);
    const initialButton = buttons.find((button) => button.dataset.calendarDay === latestActiveKey)
      || buttons.find((button) => button.classList.contains("today"))
      || buttons[0];
    if (initialButton) showCalendarDetail(initialButton);
  };
  const renderGrowth = () => {
    const snapshots = history.filter((item) => item.riotId.toLowerCase() === activePlayer.toLowerCase()).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const empty = !snapshots.length;
    document.querySelector("#growth-empty").hidden = !empty;
    document.querySelector("#growth-dashboard").hidden = empty;
    if (empty) return;
    const latest = snapshots.at(-1);
    const comparable = snapshots.filter((item) => item.games === latest.games);
    const first = comparable[0];
    const activities = activitiesFor(activePlayer, snapshots);
    const routine = routineFor(activePlayer);
    const loggedPractice = loadPracticeHistory().filter((item) => item.riotId.toLowerCase() === activePlayer.toLowerCase());
    const completed = loggedPractice.length || Object.keys(routine.completed || {}).length;
    const formatDate = (value) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
    document.querySelector("#growth-last-sync").textContent = `LAST ANALYSIS · ${formatDate(latest.timestamp)}`;
    document.querySelector("#growth-completed").textContent = completed;
    document.querySelector("#growth-checkpoints").textContent = snapshots.filter((item) => !item.imported).length;
    document.querySelector("#growth-streak").textContent = actualStreak(activities);
    document.querySelector("#growth-analyze-link").href = `/analysis?riot_id=${encodeURIComponent(activePlayer)}&count=${latest.games}`;

    const definitions = [
      { key: "avg_kda", label: "Average KDA", unit: "", lower: false },
      { key: "avg_cs_min", label: "CS per minute", unit: "", lower: false },
      { key: "avg_deaths", label: "Deaths per game", unit: "", lower: true },
      { key: "win_rate", label: "Win rate", unit: "%", lower: false },
    ];
    const changes = definitions.map((definition) => {
      const before = first.metrics[definition.key];
      const now = latest.metrics[definition.key];
      const raw = definition.lower ? before - now : now - before;
      return { ...definition, before, now, raw, percent: before ? (raw / before) * 100 : 0 };
    });
    const averageSignal = changes.reduce((sum, item) => sum + item.percent, 0) / changes.length;
    const signal = comparable.length < 2 ? "BASELINE" : averageSignal > 2 ? "IMPROVING" : averageSignal < -2 ? "NEEDS FOCUS" : "STEADY";
    document.querySelector("#growth-signal").textContent = signal;
    document.querySelector("#growth-signal-detail").textContent = comparable.length < 2 ? `Need another ${latest.games}-game sample` : `${averageSignal >= 0 ? "+" : ""}${averageSignal.toFixed(1)}% combined change`;

    const updateCoachNote = (selectedKey) => {
      const selectedDate = new Date(`${selectedKey}T12:00:00`);
      const weekStart = new Date(selectedDate);
      weekStart.setDate(selectedDate.getDate() - ((selectedDate.getDay() + 6) % 7));
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekKeys = Object.keys(activities).filter((key) => {
        const date = new Date(`${key}T12:00:00`);
        return date >= weekStart && date <= weekEnd;
      });
      const practiceDays = weekKeys.filter((key) => activities[key].practice.length).length;
      const analysisCount = weekKeys.reduce((sum, key) => sum + activities[key].analysis.length, 0);
      const selectedActivity = activities[selectedKey] || { practice: [], analysis: [] };
      const selectedAnalysis = selectedActivity.analysis.at(-1);
      const selectedPractice = selectedActivity.practice.at(-1);
      const routineDone = Object.keys(routine.completed || {}).length;
      const routineTotal = 7;
      const isToday = selectedKey === dayKey(new Date());
      const periodFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
      let title;
      let copy;
      let nextFocus;

      if (selectedAnalysis?.imported) {
        title = "Imported match review";
        copy = selectedAnalysis.coachNote || "This period is based on Riot Match-V5 history, not a recorded GameLevel PT routine session.";
        nextFocus = selectedAnalysis.focus?.[0] || latest.focus?.[0] || "Open the player analysis";
      } else if (isToday && routineDone >= routineTotal) {
        title = "The training block is complete";
        copy = `All ${routineTotal} routine days are checked. Re-analyze the same ${latest.games}-match sample now to measure what changed.`;
        nextFocus = "Run the progress re-test";
      } else if (isToday && selectedPractice) {
        const remaining = Math.max(routineTotal - routineDone, 0);
        title = `${routineDone} of ${routineTotal} routine days complete`;
        copy = `${practiceDays} practice day${practiceDays === 1 ? "" : "s"} logged this week${analysisCount ? ` with ${analysisCount} analysis checkpoint${analysisCount === 1 ? "" : "s"}` : ""}. ${remaining ? `${remaining} session${remaining === 1 ? "" : "s"} remain before the re-test.` : "You are ready to re-test."}`;
        nextFocus = remaining ? (latest.focus?.[0] || "Complete the next routine day") : "Run the progress re-test";
      } else if (selectedAnalysis) {
        const checkpointIndex = snapshots.findIndex((item) => item.id === selectedAnalysis.id);
        const previous = checkpointIndex > 0 ? snapshots[checkpointIndex - 1] : null;
        if (previous) {
          const checkpointChanges = definitions.map((definition) => {
            const before = previous.metrics[definition.key];
            const now = selectedAnalysis.metrics[definition.key];
            const raw = definition.lower ? before - now : now - before;
            return { ...definition, percent: before ? (raw / before) * 100 : 0 };
          });
          const strongest = checkpointChanges.sort((a, b) => b.percent - a.percent)[0];
          title = `${strongest.label} led this checkpoint`;
          copy = `${strongest.label} moved ${strongest.percent >= 0 ? "+" : ""}${strongest.percent.toFixed(1)}% versus the previous analysis. This week also contains ${practiceDays} practice day${practiceDays === 1 ? "" : "s"}.`;
        } else {
          title = "Your baseline checkpoint";
          copy = `This analysis started the progress record. ${practiceDays} practice day${practiceDays === 1 ? "" : "s"} followed in the selected week.`;
        }
        nextFocus = selectedAnalysis.focus?.[0] || latest.focus?.[0] || "Keep the next practice focused";
      } else if (selectedPractice) {
        title = practiceDays >= 4 ? "Consistency built momentum" : "A focused practice day is logged";
        copy = `${practiceDays} day${practiceDays === 1 ? "" : "s"} of practice were completed this week. ${analysisCount ? `${analysisCount} analysis checkpoint${analysisCount === 1 ? "" : "s"} captured the result.` : "Complete the block, then analyze again to measure the result."}`;
        nextFocus = selectedPractice.task || latest.focus?.[0] || "Protect the next practice day";
      } else {
        title = practiceDays ? "An open day inside an active week" : "No training signal this week";
        copy = practiceDays
          ? `You still logged ${practiceDays} practice day${practiceDays === 1 ? "" : "s"} this week. Use the open day for recovery or the next focused session.`
          : "No practice or analysis is saved in this week. One short, deliberate session is enough to restart the signal.";
        nextFocus = "Complete one focused session";
      }

      document.querySelector("#growth-insight-period").textContent = `${periodFormat.format(weekStart)} — ${periodFormat.format(weekEnd)} · ${practiceDays} PRACTICE / ${analysisCount} ANALYSIS`;
      document.querySelector("#growth-insight-title").textContent = title;
      document.querySelector("#growth-insight-copy").textContent = copy;
      document.querySelector("#growth-next-focus").textContent = nextFocus;
      const panel = document.querySelector(".insight-panel");
      panel.classList.remove("refresh");
      void panel.offsetWidth;
      panel.classList.add("refresh");
    };
    const renderPerformanceTrend = (selectedKey) => {
      const cutoff = new Date(`${selectedKey}T23:59:59`);
      const selectedActivity = activities[selectedKey] || { analysis: [] };
      const target = selectedActivity.analysis.at(-1)
        || snapshots.filter((item) => new Date(item.timestamp) <= cutoff).at(-1);
      const trendGrid = document.querySelector("#trend-grid");
      const selectedLabel = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${selectedKey}T12:00:00`));

      if (!target) {
        document.querySelector("#trend-period").textContent = `AS OF ${selectedLabel.toUpperCase()}`;
        document.querySelector("#trend-copy").textContent = "No analysis checkpoint existed by this date. Choose a later highlighted analysis day.";
        trendGrid.innerHTML = '<div class="trend-empty">NO PERFORMANCE CHECKPOINT YET</div>';
        return;
      }

      const targetTime = new Date(target.timestamp).getTime();
      const series = snapshots.filter((item) => item.games === target.games && new Date(item.timestamp).getTime() <= targetTime);
      const previous = series.length > 1 ? series.at(-2) : null;
      const checkpointChanges = definitions.map((definition) => {
        const before = previous?.metrics[definition.key];
        const now = target.metrics[definition.key];
        const raw = previous ? (definition.lower ? before - now : now - before) : 0;
        return { ...definition, before, now, percent: previous && before ? (raw / before) * 100 : 0 };
      });
      const checkpointDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(target.timestamp));
      document.querySelector("#trend-period").textContent = previous ? `PREVIOUS → ${checkpointDate.toUpperCase()}` : `BASELINE · ${checkpointDate.toUpperCase()}`;
      document.querySelector("#trend-copy").textContent = selectedActivity.analysis.length
        ? `Change from the previous equal-size ${target.games}-match checkpoint to the analysis selected on the calendar.`
        : `Latest saved checkpoint available by ${selectedLabel}. Choose a highlighted analysis day for an exact checkpoint view.`;
      trendGrid.innerHTML = checkpointChanges.map((item) => {
        const positive = previous && item.percent > .5;
        const negative = previous && item.percent < -.5;
        const changeLabel = previous ? `${item.percent >= 0 ? "+" : ""}${item.percent.toFixed(1)}%` : "BASELINE";
        return `<article class="trend-card ${positive ? "up" : negative ? "down" : "flat"}"><div><span>${escapeGrowthHtml(item.label)}</span><b>${changeLabel}</b></div>${sparkline(series.map((row) => row.metrics[item.key]), item.lower)}<footer><strong>${previous ? `${item.before}${item.unit}` : "—"}</strong><i>→</i><strong>${item.now}${item.unit}</strong></footer></article>`;
      }).join("");
      trendGrid.classList.remove("refresh");
      void trendGrid.offsetWidth;
      trendGrid.classList.add("refresh");
    };
    document.querySelector("#checkpoint-count").textContent = `${snapshots.length} SAVED`;
    document.querySelector("#checkpoint-list").innerHTML = [...snapshots].reverse().slice(0, 8).map((item, index) => `<article><span class="checkpoint-index">${String(snapshots.length - index).padStart(2, "0")}</span><div><strong>${formatDate(item.timestamp)}</strong><small>${escapeGrowthHtml(item.role)} · ${item.games} games · ${escapeGrowthHtml(item.source)}</small></div><span>KDA <b>${item.metrics.avg_kda}</b></span><span>CS/M <b>${item.metrics.avg_cs_min}</b></span><span>DEATHS <b>${item.metrics.avg_deaths}</b></span><span>WR <b>${item.metrics.win_rate}%</b></span></article>`).join("");
    renderCalendar(activities, (selectedKey) => {
      updateCoachNote(selectedKey);
      renderPerformanceTrend(selectedKey);
    });
  };

  if (!profiles.length) {
    playerSelect.innerHTML = '<option value="">No saved players</option>';
    document.querySelector("#growth-empty").hidden = false;
  } else {
    playerSelect.innerHTML = profiles.map((profile) => `<option value="${escapeGrowthHtml(profile)}">${escapeGrowthHtml(profile)}</option>`).join("");
    if (!profiles.some((profile) => profile.toLowerCase() === activePlayer.toLowerCase())) activePlayer = profiles.at(-1);
    playerSelect.value = activePlayer;
    const latest = history.filter((item) => item.riotId.toLowerCase() === activePlayer.toLowerCase()).at(-1);
    if (latest) calendarDate = new Date(latest.timestamp);
    renderGrowth();
  }
  playerSelect.addEventListener("change", () => {
    activePlayer = playerSelect.value;
    localStorage.setItem("rift-active-player", activePlayer);
    const latest = history.filter((item) => item.riotId.toLowerCase() === activePlayer.toLowerCase()).at(-1);
    if (latest) calendarDate = new Date(latest.timestamp);
    renderGrowth();
  });
  document.querySelector("#calendar-prev")?.addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() - 1); renderGrowth(); });
  document.querySelector("#calendar-next")?.addEventListener("click", () => { calendarDate.setMonth(calendarDate.getMonth() + 1); renderGrowth(); });
}
