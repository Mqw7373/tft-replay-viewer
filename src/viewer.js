"use strict";
const DATA = { keys: AlphaSim.keys, battles: [] };
const $ = (id) => document.getElementById(id),
  esc = (s) =>
    String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  fmt = (n, d = 1) =>
    n == null
      ? "—"
      : Number(n).toLocaleString("zh-CN", { maximumFractionDigits: d });
let battle,
  frame = 0,
  selected = { side: "my", i: 0 },
  playing = false,
  last = 0,
  acc = 0,
  eventIndex = null;
const K = Object.fromEntries(DATA.keys.map((k, i) => [k, i])),
  other = (s) => (s === "my" ? "en" : "my"),
  sideName = (s) => (s === "my" ? "我方" : "对手"),
  current = () => battle.times[frame],
  unit = (s, i) => battle.sides[s]?.[i],
  snapshot = (s, i, f = frame) => {
    const a = unit(s, i)?.stats[f];
    return a ? Object.fromEntries(DATA.keys.map((k, j) => [k, a[j]])) : null;
  },
  kindName = {
    cast: "施法",
    damage: "伤害",
    heal: "负值 / 回复",
    death: "死亡",
  };
function nearest(t) {
  let j = 0;
  while (
    j + 1 < battle.times.length &&
    Math.abs(battle.times[j + 1] - t) < Math.abs(battle.times[j] - t)
  )
    j++;
  return j;
}
function firstEvent(type) {
  return battle.events.find(
    (e) =>
      e.side === selected.side &&
      e.ci === selected.i &&
      e.kind === (type === "cast" ? "cast" : "damage"),
  );
}
function isSacrifice(s, i) {
  return !!unit(s, i)?.preCombatSacrifice;
}
function alive(u, t) {
  return (
    u.birth !== null && t >= u.birth && (u.death == null || t < u.death - 1e-6)
  );
}
function selectUnit(s, i) {
  selected = { side: s, i };
  $("unitSelect").value = s + ":" + i;
  eventIndex = null;
  render();
  renderEvents();
  $("eventDetail").innerHTML = "点击事件，查看该次返回值与相邻采样状态。";
}
function setTime(t) {
  frame = nearest(t);
  render();
  renderEvents();
}
function load(n) {
  playing = false;
  $("play").textContent = "▶ 播放";
  battle = DATA.battles[n];
  frame = 0;
  eventIndex = null;
  selected = {
    side: "my",
    i: battle.sides.my.reduce(
      (best, u, i, a) => (u.total > a[best].total ? i : best),
      0,
    ),
  };
  $("seek").max = battle.times.length - 1;
  $("unitSelect").innerHTML = Object.entries(battle.sides)
    .flatMap(([s, a]) =>
      a.map(
        (u, i) =>
          `<option value="${s}:${i}">${sideName(s)} · ${esc(u.name)}${u.initial ? "" : "（召唤）"}</option>`,
      ),
    )
    .join("");
  $("unitSelect").value = "my:" + selected.i;
  $("result").textContent =
    `日志结果：${battle.winner === "my" ? "我方胜" : battle.winner === "enemy" ? "对手胜" : "平局"} · 末帧 ${fmt(battle.times.at(-1))} 秒 · ${battle.label}${battle.synthetic ? " · 自制示例，数值为虚构" : ""}`;
  $("request").textContent = battle.request
    ? JSON.stringify(battle.request, null, 2)
    : "此日志不含 request，无法核对原始开战输入。";
  $("downloadRequest").disabled = !battle.request;
  $("roster").innerHTML = ["my", "en"]
    .flatMap((s) =>
      battle.sides[s]
        .filter((u) => u.initial)
        .map((u, i) => {
          const c =
            battle.request?.[s === "my" ? "myLineup" : "enemyLineup"]?.[i];
          const extra = c
            ? Object.fromEntries(
                Object.entries(c).filter(
                  ([k]) =>
                    !["apiName", "stars", "items", "position"].includes(k),
                ),
              )
            : null;
          return `<tr><td>${sideName(s)}</td><td>${esc(u.name)}</td><td>${u.stars}★</td><td>${c?.position ? esc(c.position.row) + ", " + esc(c.position.col) : "未知"}</td><td>${u.items.map(esc).join(" / ") || "无"}</td><td>${extra && Object.keys(extra).length ? `<details><summary>查看</summary><pre>${esc(JSON.stringify(extra, null, 2))}</pre></details>` : "—"}</td></tr>`;
        }),
    )
    .join("");
  $("importStatus").textContent = [
    battle.synthetic
      ? "当前是自制示例：数值为虚构，仅演示界面。"
      : "已载入 " + battle.label,
    ...battle.warnings,
  ].join("\n");
  $("eventDetail").textContent = "点击事件，查看该次返回值与相邻采样状态。";
  render();
  renderEvents();
}
function render() {
  const t = current(),
    u = unit(selected.side, selected.i),
    s = snapshot(selected.side, selected.i);
  $("clock").textContent = t.toFixed(1) + " s";
  $("seek").value = frame;
  $("unitTitle").textContent = `${u.name} · ${u.stars}★`;
  const flags = [
    u.loadedStats.s18RiftbeastAlphaMarked ? "野怪印记" : "",
    isSacrifice(selected.side, selected.i) ? "Blackthorn 献祭" : "",
  ].filter(Boolean);
  $("gear").innerHTML =
    [...u.items, ...flags]
      .map((x) => `<span class="chip">${esc(x)}</span>`)
      .join("") || '<span class="muted">无装备</span>';
  const stats = [
    ["生命", fmt(s.hp) + " / " + fmt(s.maxHp)],
    ["护盾", fmt(s.shield)],
    ["法力", fmt(s.mana) + " / " + fmt(u.manaMax)],
    ["攻击力", fmt(s.curAD)],
    ["法强（含基础）", fmt(s.curAP)],
    ["攻速", fmt(s.curAS, 3)],
    ["护甲", fmt(s.curArmor)],
    ["魔抗", fmt(s.curMR)],
    ["护甲 / 魔抗削减", fmt(s.armorShredPct) + " / " + fmt(s.mrShredPct) + "%"],
    ["耐久%", fmt(s.durabilityPct)],
    ["增伤%", fmt(s.dmgAmpPct)],
    ["攻击距离", fmt(s.attackRange)],
  ];
  $("stats").innerHTML = stats
    .map(([l, v]) => `<div class="stat"><span>${l}</span><b>${v}</b></div>`)
    .join("");
  let status =
    u.birth === null
      ? "出生时间未知（棋盘不显示）"
      : t < u.birth
        ? "尚未出生（显示的是接口补齐快照）"
        : !alive(u, t)
          ? isSacrifice(selected.side, selected.i)
            ? "开战献祭"
            : "已阵亡"
          : s.ccEnd > t
            ? "控制中"
            : s.channelEnd > t
              ? "引导中"
              : s.castingEnd > t
                ? "施法期间"
                : "存活";
  $("unitState").textContent =
    `${sideName(selected.side)} · ${status}${u.death != null ? " · 记录死亡 " + fmt(u.death) + " 秒" : ""}`;
  $("ability").textContent = JSON.stringify(
    {
      loadedStats: u.loadedStats,
      preCombatSacrifice: u.preCombatSacrifice,
      ability: u.ability,
      birthNote: u.birthNote,
    },
    null,
    2,
  );
  $("curveLegend").textContent = `${sideName(selected.side)} ${u.name}`;
  $("firstCast").disabled = !firstEvent("cast");
  $("firstImpact").disabled = !firstEvent("impact");
  $("damageTotal").textContent =
    `此刻 ${fmt(u.cum[frame])} / 全场 ${fmt(u.total)}`;
  drawBoard();
  drawChart();
}
function drawBoard() {
  let a = ['<rect width="630" height="620" rx="14" fill="#0d1727"/>'];
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 7; c++)
      a.push(
        `<rect x="${15 + c * 86}" y="${12 + r * 74}" width="80" height="67" rx="12" fill="${r < 4 ? "#271f2b" : "#152c37"}" stroke="#2c384b"/>`,
      );
  a.push(
    '<line x1="10" x2="620" y1="307" y2="307" stroke="#70839d" stroke-dasharray="5 7"/>',
  );
  for (const side of ["en", "my"])
    battle.sides[side].forEach((u, i) => {
      if (u.birth === null || current() < u.birth) return;
      const s = snapshot(side, i),
        p = u.positions[frame];
      if (!p) return;
      const x = 55 + p.cx * 86,
        y = 45 + (7 - p.cy) * 74,
        isAlive = alive(u, current()),
        color = side === "my" ? "#66d9ee" : "#ffab96",
        sel = side === selected.side && i === selected.i;
      const hp = Math.max(0, Math.min(1, s.hp / Math.max(1, s.maxHp))),
        mp = Math.max(0, Math.min(1, s.mana / Math.max(1, u.manaMax)));
      a.push(
        `<g class="unit" data-side="${side}" data-i="${i}" tabindex="0" role="button" aria-label="${sideName(side)} ${esc(u.name)}" transform="translate(${x},${y})" opacity="${isAlive ? 1 : 0.32}"><title>${esc(u.name)} ${u.stars}★ · HP ${fmt(s.hp)} · 伤害 ${fmt(u.cum[frame])}</title><rect x="-38" y="-29" width="76" height="60" rx="9" fill="${side === "my" ? "#183943" : "#463032"}" stroke="${sel ? "#fff" : color}" stroke-width="${sel ? 3 : 1}"/><text y="-12" text-anchor="middle" fill="${color}" font-size="10">${u.stars}★${isSacrifice(side, i) ? " 献祭" : !isAlive ? " 阵亡" : ""}</text><text y="3" text-anchor="middle" fill="white" font-size="${u.name.length > 9 ? 9 : 11}">${esc(u.name.length > 12 ? u.name.slice(0, 11) + "…" : u.name)}</text><rect x="-31" y="10" width="62" height="5" rx="2" fill="#080f18"/><rect x="-31" y="10" width="${62 * hp}" height="5" rx="2" fill="#70dba0"/><rect x="-31" y="19" width="${62 * mp}" height="3" fill="#68acff"/>${s.shield > 0 ? `<text x="0" y="40" text-anchor="middle" fill="#dbe5f3" font-size="10">盾 ${fmt(s.shield, 0)}</text>` : ""}</g>`,
      );
    });
  $("board").innerHTML = a.join("");
}
function drawChart() {
  const canvas = $("chart"),
    rect = canvas.getBoundingClientRect(),
    dpr = devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = 170 * dpr;
  const c = canvas.getContext("2d");
  c.scale(dpr, dpr);
  const w = rect.width,
    h = 170,
    u = unit(selected.side, selected.i),
    max = Math.max(1, ...u.cum),
    end = battle.times.at(-1),
    x = (t) => 48 + ((w - 65) * t) / end,
    y = (v) => 137 - (115 * v) / max;
  c.fillStyle = "#9dafc5";
  c.font = "11px system-ui";
  for (let j = 0; j < 3; j++) {
    let v = (max * j) / 2;
    c.fillText(fmt(v, max < 10 ? 1 : 0), 4, y(v) + 4);
    c.strokeStyle = "#273448";
    c.beginPath();
    c.moveTo(48, y(v));
    c.lineTo(w - 17, y(v));
    c.stroke();
  }
  for (let j = 0; j < 5; j++) {
    let t = (end * j) / 4;
    c.fillText(fmt(t) + "s", x(t) - 10, 160);
  }
  c.strokeStyle = selected.side === "my" ? "#66d9ee" : "#ffab96";
  c.lineWidth = 2;
  c.beginPath();
  u.cum.forEach((v, i) =>
    i ? c.lineTo(x(battle.times[i]), y(v)) : c.moveTo(x(battle.times[i]), y(v)),
  );
  c.stroke();
  c.strokeStyle = "#e5c77d";
  c.beginPath();
  c.moveTo(x(current()), 12);
  c.lineTo(x(current()), 140);
  c.stroke();
}
function eventLabel(e) {
  const src = unit(e.side, e.ci)?.name || `#${e.ci}`;
  if (e.kind === "death")
    return `${src} ${isSacrifice(e.side, e.ci) ? "献祭" : "死亡"}`;
  if (e.kind === "cast")
    return `${src} · ${e.raw.abType || "施法"}${e.raw.targetCis ? " · 目标索引 " + e.raw.targetCis.join("、") : ""}`;
  if (e.kind === "heal") return `${src} · 负值 / 回复记录（目标归属未知）`;
  const target = unit(other(e.side), e.raw.tci)?.name || `#${e.raw.tci}`;
  return `${src} → ${target}${e.raw.stage ? " · stage " + e.raw.stage : ""}${e.raw.popKind ? " · " + e.raw.popKind : ""}`;
}
function renderEvents() {
  const list = battle.events
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => {
      if (!$("showBurn").checked && e.raw.popKind === "burn") return false;
      if ($("eventKind").value !== "all" && e.kind !== $("eventKind").value)
        return false;
      if (
        $("onlyUnit").checked &&
        !(
          (e.side === selected.side && e.ci === selected.i) ||
          (e.kind === "damage" &&
            e.side !== selected.side &&
            e.raw.tci === selected.i)
        )
      )
        return false;
      return true;
    });
  $("events").innerHTML = list
    .map(
      ({ e, i }) =>
        `<button class="event ${e.t > current() ? "future" : ""} ${i === eventIndex ? "active" : ""}" data-event="${i}"><time>${e.t.toFixed(1)}s</time><span>${esc(eventLabel(e))}</span><span>${e.kind === "damage" || e.kind === "heal" ? fmt(e.raw.dmg, 0) : kindName[e.kind]}</span></button>`,
    )
    .join("");
  $("eventCount").textContent =
    `显示 ${list.length} 条 / 全场 ${battle.events.length} 条。`;
}
function compact(s, i, f) {
  const v = snapshot(s, i, f);
  if (!v) return null;
  return {
    time: battle.times[f],
    name: unit(s, i).name,
    ...Object.fromEntries(
      [
        "hp",
        "maxHp",
        "shield",
        "mana",
        "curAD",
        "curAP",
        "curAS",
        "curArmor",
        "curMR",
        "armorShredPct",
        "mrShredPct",
        "durabilityPct",
        "dmgAmpPct",
      ].map((k) => [k, v[k]]),
    ),
    cumDamage: unit(s, i).cum[f],
  };
}
function inspect(i) {
  eventIndex = i;
  const e = battle.events[i];
  setTime(e.t);
  const f = frame,
    prev = Math.max(0, f - 1),
    src = unit(e.side, e.ci),
    target =
      e.kind === "damage" && Number.isInteger(e.raw.tci)
        ? unit(other(e.side), e.raw.tci)
        : null;
  let body = `<p><strong>${fmt(e.t)} 秒 · ${esc(eventLabel(e))}</strong></p>`;
  if (e.kind === "damage")
    body += `<p>返回 dmg：<strong class="kpi">${fmt(e.raw.dmg, 4)}</strong>；${e.raw.trueDamage === true ? "trueDamage=true" : e.raw.phys === true ? "phys=true" : e.raw.phys === false ? "phys=false" : "类型未声明"}${e.raw.evDmg != null ? "；evDmg=" + fmt(e.raw.evDmg, 4) + "（字段语义未核实）" : ""}。</p>`;
  if (e.t > battle.times.at(-1) + 1e-6)
    body +=
      '<p class="notice">此事件晚于最后一个采样点，没有对应状态。下面仅显示末尾两帧作为参考，不能据此核对本次结算。</p>';
  body +=
    '<p class="muted">下面是前一采样点与事件对应采样点，同一采样区间可能包含多次伤害、治疗或护盾变化；不能把生命差直接归因于这一条事件。</p>';
  body += `<details open><summary>事件原始 JSON</summary><pre>${esc(JSON.stringify(e.raw, null, 2))}</pre></details><div class="audit"><div><b>来源 · ${esc(src?.name)}</b><pre>${esc(JSON.stringify({ before: compact(e.side, e.ci, prev), at: compact(e.side, e.ci, f) }, null, 2))}</pre></div>`;
  if (target)
    body += `<div><b>目标 · ${esc(target.name)}</b><pre>${esc(JSON.stringify({ before: compact(other(e.side), e.raw.tci, prev), at: compact(other(e.side), e.raw.tci, f) }, null, 2))}</pre></div>`;
  body +=
    '</div><p class="muted">无法从这些字段独立还原完整暴击与减伤公式。要验证公式，需要模拟器内部逐步调试日志或游戏对照记录。</p>';
  $("eventDetail").innerHTML = body;
}
$("trial").onchange = () => load(+$("trial").value);
$("unitSelect").onchange = () => {
  const [s, i] = $("unitSelect").value.split(":");
  selectUnit(s, +i);
};
$("seek").oninput = () => setTime(battle.times[+$("seek").value]);
$("back").textContent = "上一帧";
$("next").textContent = "下一帧";
$("back").onclick = () => setTime(battle.times[Math.max(0, frame - 1)]);
$("next").onclick = () =>
  setTime(battle.times[Math.min(frame + 1, battle.times.length - 1)]);
$("ten").onclick = () => setTime(10);
$("end").onclick = () => setTime(battle.times.at(-1));
$("firstCast").onclick = () => {
  const e = firstEvent("cast");
  if (e) inspect(battle.events.indexOf(e));
};
$("firstImpact").onclick = () => {
  const e = firstEvent("impact");
  if (e) inspect(battle.events.indexOf(e));
};
$("board").onclick = (e) => {
  const el = e.target.closest(".unit");
  if (el) selectUnit(el.dataset.side, +el.dataset.i);
};
$("board").onkeydown = (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    e.target
      .closest(".unit")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
};
$("events").onclick = (e) => {
  const el = e.target.closest("[data-event]");
  if (el) inspect(+el.dataset.event);
};
for (const id of ["onlyUnit", "showBurn", "eventKind"])
  $(id).onchange = renderEvents;
$("chart").onclick = (e) => {
  const r = $("chart").getBoundingClientRect();
  setTime(
    Math.max(0, Math.min(1, (e.clientX - r.left - 48) / (r.width - 65))) *
      battle.times.at(-1),
  );
};
$("play").onclick = () => {
  playing = !playing;
  if (playing && frame === battle.times.length - 1) setTime(0);
  last = performance.now();
  acc = 0;
  $("play").textContent = playing ? "Ⅱ 暂停" : "▶ 播放";
};
function tick(now) {
  if (playing) {
    acc += ((now - last) / 1000) * +$("speed").value;
    let changed = false;
    while (
      frame + 1 < battle.times.length &&
      acc >= battle.times[frame + 1] - battle.times[frame]
    ) {
      acc -= battle.times[frame + 1] - battle.times[frame];
      frame++;
      changed = true;
    }
    if (changed) {
      render();
      renderEvents();
    }
    if (frame === battle.times.length - 1) {
      playing = false;
      $("play").textContent = "▶ 播放";
    }
  }
  last = now;
  requestAnimationFrame(tick);
}

function download(value, name) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
      type: "application/json",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("downloadRequest").onclick = () => {
  if (battle.request) download(battle.request, "battle-request.json");
};
$("downloadLog").onclick = () => download(battle.original, "battle-log.json");
function install(battles) {
  DATA.battles = battles;
  $("trial").innerHTML = battles
    .map(
      (b, i) =>
        `<option value="${i}">第 ${i + 1} / ${battles.length} 场 · ${esc(b.label)}</option>`,
    )
    .join("");
  load(0);
}
let importing = false;
async function importFiles(files) {
  if (importing) return;
  const list = Array.from(files);
  if (!list.length) return;
  if (list.length > 20) {
    $("importStatus").textContent = "一次最多导入 20 个文件。";
    return;
  }
  importing = true;
  playing = false;
  $("play").textContent = "▶ 播放";
  $("files").disabled = true;
  $("demo").disabled = true;
  $("importStatus").textContent = "正在本地解析…";
  try {
    const parsed = [];
    for (const file of list) parsed.push(await AlphaSim.readFile(file));
    install(parsed);
  } catch (error) {
    $("importStatus").textContent =
      "导入失败，保留之前的回放：" + error.message;
  } finally {
    importing = false;
    $("files").disabled = false;
    $("files").value = "";
    $("demo").disabled = false;
  }
}
$("files").onchange = () => importFiles($("files").files);
$("exampleSelect").innerHTML = window.DEMO_EXAMPLES.map(
  (entry, i) => `<option value="${i}">${esc(entry.label)}</option>`,
).join("");
function exampleChoice() {
  return window.DEMO_EXAMPLES[+$("exampleSelect").value];
}
function describeExample() {
  $("exampleDescription").textContent =
    "自制虚构数据 · " + exampleChoice().description;
}
$("exampleSelect").onchange = describeExample;
$("demo").onclick = () => {
  const entry = exampleChoice();
  install([AlphaSim.parse(entry.record, entry.label)]);
};
$("downloadExample").onclick = () => {
  const entry = exampleChoice();
  download(entry.record, entry.file);
};
describeExample();
window.addEventListener("dragover", (e) => {
  e.preventDefault();
  $("dropzone").classList.add("drag");
});
window.addEventListener("dragleave", (e) => {
  if (!e.relatedTarget) $("dropzone").classList.remove("drag");
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  $("dropzone").classList.remove("drag");
  importFiles(e.dataTransfer.files);
});
window.addEventListener("resize", () => {
  if (battle) drawChart();
});
install([AlphaSim.parse(window.DEMO_LOG, window.DEMO_EXAMPLES[0].label)]);
requestAnimationFrame(tick);
