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
    window.location.href = `/analysis?riot_id=${encodeURIComponent(riotId)}&count=10`;
  });
}

const GROWTH_HISTORY_KEY = "rift-growth-history:v1";
const PRACTICE_HISTORY_KEY = "rift-practice-history:v1";

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

const seedDemoProfile = (data, routine) => {
  const demoKey = data.riot_id.toLowerCase();
  const history = loadGrowthHistory();
  if (history.some((item) => item.riotId.toLowerCase() === demoKey)) return null;

  const now = new Date();
  const stampDaysAgo = (days, hour = 20) => {
    const date = new Date(now);
    date.setDate(date.getDate() - days);
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  };
  const metricPath = [
    { days: 28, win_rate: 45, avg_kda: 3.15, avg_cs_min: 6.4, avg_deaths: 5.9, gap: 25, completed: 0 },
    { days: 21, win_rate: 48, avg_kda: 3.45, avg_cs_min: 6.7, avg_deaths: 5.5, gap: 21, completed: 5 },
    { days: 14, win_rate: 52, avg_kda: 3.8, avg_cs_min: 7.0, avg_deaths: 5.1, gap: 17, completed: 11 },
    { days: 7, win_rate: 56, avg_kda: 4.2, avg_cs_min: 7.3, avg_deaths: 4.7, gap: 12, completed: 17 },
    {
      days: 0,
      win_rate: Number(data.summary.win_rate),
      avg_kda: Number(data.summary.avg_kda),
      avg_cs_min: Number(data.summary.avg_cs_min),
      avg_deaths: Number(data.summary.avg_deaths),
      gap: Number((data.benchmark.comparisons.reduce((sum, item) => sum + item.gap_score, 0) / data.benchmark.comparisons.length).toFixed(1)),
      completed: 23,
    },
  ];
  const demoSnapshots = metricPath.map((point, index) => ({
    id: `demo-checkpoint-${index + 1}`,
    riotId: data.riot_id,
    timestamp: stampDaysAgo(point.days, 21),
    source: "demo",
    games: 10,
    role: data.summary.favorite_role,
    metrics: {
      win_rate: point.win_rate,
      avg_kda: point.avg_kda,
      avg_cs_min: point.avg_cs_min,
      avg_deaths: point.avg_deaths,
    },
    gapScore: point.gap,
    focus: routine.focus_areas.map((item) => item.title),
    routineCompleted: point.completed,
  }));
  localStorage.setItem(GROWTH_HISTORY_KEY, JSON.stringify([...history, ...demoSnapshots].slice(-120)));
  localStorage.setItem("rift-active-player", data.riot_id);

  const blockStart = stampDaysAgo(3, 9);
  const currentCompleted = {};
  [3, 2, 1, 0].forEach((daysAgo, index) => {
    currentCompleted[index + 1] = stampDaysAgo(daysAgo);
  });
  const routineState = { completed: currentCompleted, startedAt: blockStart };

  const otherPractice = loadPracticeHistory().filter((item) => item.riotId.toLowerCase() !== demoKey);
  const demoPractice = [];
  let sequence = 1;
  for (let daysAgo = 28; daysAgo >= 5; daysAgo -= 1) {
    if (daysAgo % 6 === 0) continue;
    const scheduleDay = ((sequence - 1) % 7) + 1;
    demoPractice.push({
      id: `${demoKey}|demo-block-${Math.floor((sequence - 1) / 7) + 1}|${scheduleDay}`,
      riotId: data.riot_id,
      block: `demo-block-${Math.floor((sequence - 1) / 7) + 1}`,
      day: scheduleDay,
      task: routine.schedule[scheduleDay - 1].task,
      timestamp: stampDaysAgo(daysAgo),
    });
    sequence += 1;
  }
  Object.entries(currentCompleted).forEach(([day, timestamp]) => {
    demoPractice.push({
      id: `${demoKey}|${blockStart}|${day}`,
      riotId: data.riot_id,
      block: blockStart,
      day: Number(day),
      task: routine.schedule[Number(day) - 1].task,
      timestamp,
    });
  });
  localStorage.setItem(PRACTICE_HISTORY_KEY, JSON.stringify([...otherPractice, ...demoPractice].slice(-500)));
  return routineState;
};


const loadGrowthHistory = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(GROWTH_HISTORY_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch (_) {
    return [];
  }
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
    document.querySelector("#analysis-results").hidden = loading;
    document.querySelector("#error-state").hidden = true;
    const status = document.querySelector("#analysis-status");
    status.classList.toggle("ready", !loading);
    status.querySelector("span").textContent = loading ? "SYNCING" : "SIGNAL READY";
  };

  const showError = (message) => {
    document.querySelector("#loading-state").hidden = true;
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
    document.querySelector("#favorite-role").textContent =
      `PRIMARY / ${summary.favorite_role.toUpperCase()}`;

    document.querySelector("#summary-metrics").innerHTML = [
      metricCard("WIN RATE", `${summary.win_rate}%`, `${summary.wins}W · ${summary.losses}L`),
      metricCard("AVERAGE KDA", summary.avg_kda, "Kills + assists per death"),
      metricCard("CS PER MIN", summary.avg_cs_min, `${summary.avg_cs} average CS`),
      metricCard("COMFORT ROLE", summary.favorite_role, `${summary.champion_pool} picks in pool`),
    ].join("");

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
    if (data.demo) {
      const seededState = seedDemoProfile(data, routine);
      if (seededState) routineState = seededState;
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
    if (!data.demo) saveGrowthSnapshot(data, routine, routineState, forceSnapshot);

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
        (match) => `
        <article class="match-item ${match.win ? "win" : "loss"}">
          <i class="match-result"></i>
          <strong>${escapeHtml(match.champion)}</strong>
          <span>${escapeHtml(match.role.toUpperCase())}</span>
          <span class="match-score">${escapeHtml(match.score)}</span>
          <span>${match.duration} MIN</span>
        </article>`
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
    window.history.replaceState({}, "", `/analysis?riot_id=${encodeURIComponent(riotId)}&count=${count}`);
    loadAnalysis(riotId, count, true);
  });

  loadAnalysis(analysisApp.dataset.riotId, analysisApp.dataset.count);
}

const growthApp = document.querySelector("#growth-app");

if (growthApp) {
  const history = loadGrowthHistory();
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
  const renderCalendar = (activities) => {
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
      cells.push(`<button type="button" class="calendar-day ${kind}${today}" data-calendar-day="${key}"><span>${day}</span>${activity ? `<i>${activity.practice.length ? `${activity.practice.length}D` : `${activity.analysis.length}A`}</i>` : ""}</button>`);
    }
    document.querySelector("#growth-calendar").innerHTML = cells.join("");
    document.querySelectorAll("[data-calendar-day]").forEach((button) => {
      button.addEventListener("click", () => {
        document.querySelectorAll(".calendar-day.selected").forEach((item) => item.classList.remove("selected"));
        button.classList.add("selected");
        const activity = activities[button.dataset.calendarDay];
        document.querySelector("#calendar-detail").innerHTML = activity
          ? `<strong>${button.dataset.calendarDay}</strong><span>${activity.practice.length} practice day${activity.practice.length === 1 ? "" : "s"} completed · ${activity.analysis.length} analysis checkpoint${activity.analysis.length === 1 ? "" : "s"}</span>`
          : `<strong>${button.dataset.calendarDay}</strong><span>No saved activity.</span>`;
      });
    });
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
    document.querySelector("#growth-checkpoints").textContent = snapshots.length;
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

    const best = [...changes].sort((a, b) => b.percent - a.percent)[0];
    document.querySelector("#growth-insight-title").textContent = comparable.length < 2 ? "Comparable baseline saved" : best.percent > 0 ? `${best.label} leads your growth` : "Consistency is the next win";
    document.querySelector("#growth-insight-copy").textContent = comparable.length < 2
      ? `Complete the routine, then analyze the same ${latest.games}-game sample size again for a fair before-and-after signal.`
      : best.percent > 0
        ? `${best.label} improved by ${Math.abs(best.percent).toFixed(1)}% from your first checkpoint. Keep the strongest habit and protect it in the next block.`
        : "The latest checkpoint has not moved above the baseline yet. Keep the sample consistent and follow the next focus for another block.";
    document.querySelector("#growth-next-focus").textContent = latest.focus?.[0] || "Complete the next routine day";
    document.querySelector("#trend-grid").innerHTML = changes.map((item) => {
      const positive = item.percent > .5;
      const negative = item.percent < -.5;
      return `<article class="trend-card ${positive ? "up" : negative ? "down" : "flat"}"><div><span>${escapeGrowthHtml(item.label)}</span><b>${item.percent >= 0 ? "+" : ""}${item.percent.toFixed(1)}%</b></div>${sparkline(comparable.map((row) => row.metrics[item.key]), item.lower)}<footer><strong>${item.before}${item.unit}</strong><i>→</i><strong>${item.now}${item.unit}</strong></footer></article>`;
    }).join("");
    document.querySelector("#checkpoint-count").textContent = `${snapshots.length} SAVED`;
    document.querySelector("#checkpoint-list").innerHTML = [...snapshots].reverse().slice(0, 8).map((item, index) => `<article><span class="checkpoint-index">${String(snapshots.length - index).padStart(2, "0")}</span><div><strong>${formatDate(item.timestamp)}</strong><small>${escapeGrowthHtml(item.role)} · ${item.games} games · ${escapeGrowthHtml(item.source)}</small></div><span>KDA <b>${item.metrics.avg_kda}</b></span><span>CS/M <b>${item.metrics.avg_cs_min}</b></span><span>DEATHS <b>${item.metrics.avg_deaths}</b></span><span>WR <b>${item.metrics.win_rate}%</b></span></article>`).join("");
    renderCalendar(activities);
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
