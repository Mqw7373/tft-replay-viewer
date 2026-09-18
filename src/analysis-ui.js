let analysisGroups = [];
function setupAnalysis() {
  const side = $("analysisSide").value,
    old = $("analysisCarry").value,
    names = new Map();
  DATA.battles.forEach((b) =>
    b.sides[side]
      .filter((u) => u.initial)
      .forEach((u) => names.set(u.api, u.name)),
  );
  $("analysisCarry").innerHTML = [...names]
    .map(([api, name]) => `<option value="${esc(api)}">${esc(name)}</option>`)
    .join("");
  const first = DATA.battles[0].sides[side].filter((u) => u.initial),
    defaultUnit = first.reduce(
      (best, u) => (u.total > best.total ? u : best),
      first[0],
    );
  $("analysisCarry").value = names.has(old) ? old : defaultUnit.api;
  analysisGroups = BattleAnalysis.groups(DATA.battles);
  $("analysisGroup").innerHTML =
    '<option value="all">全部方案</option>' +
    analysisGroups
      .map(
        (g) =>
          `<option value="${g.id}">${g.label} · ${g.indices.length} 场</option>`,
      )
      .join("");
  renderAnalysis();
}
function summaryCell(values, total) {
  const s = BattleAnalysis.stats(values);
  return s.n
    ? `<b>${fmt(s.median)}</b><small> [${fmt(s.q1)}, ${fmt(s.q3)}]<br>${s.n}/${total} 场</small>`
    : `<span class="muted">—<br>0/${total} 场</span>`;
}
function renderAnalysis() {
  const side = $("analysisSide").value,
    api = $("analysisCarry").value,
    all = DATA.battles.map((b) => BattleAnalysis.metrics(b, side, api));
  $("analysisCount").textContent =
    `已载入 ${DATA.battles.length} 场 · ${analysisGroups.length} 个配置组。主 C 跨场固定为所选单位；未选择时默认首场伤害最高者。`;
  $("groupSummary").innerHTML = analysisGroups
    .map((g) => {
      const m = g.indices.map((i) => all[i]),
        wins = g.indices.filter(
          (i) => DATA.battles[i].winner === (side === "my" ? "my" : "enemy"),
        ).length,
        draws = g.indices.filter(
          (i) => DATA.battles[i].winner === "draw",
        ).length;
      const survival = (t) => {
        const v = m.map((x) => x["survival" + t]).filter((x) => x !== null);
        return v.length
          ? `${fmt((100 * v.reduce((s, x) => s + x, 0)) / v.length)}% (${v.length}/${m.length} 已知)`
          : "—";
      };
      return `<tr><td><button class="smallbtn" data-group="${g.id}">${g.label}</button><br><small>对手 ${g.opponent}${g.synthetic ? " · 自制示例" : ""}${!g.request ? " · 输入未知，单列" : ""}</small></td><td>${wins}/${m.length} 胜<br><small>${draws} 平</small></td>${[
        0, 1, 2,
      ]
        .map(
          (j) =>
            `<td>${summaryCell(
              m.map((x) => x.team[j].value),
              m.length,
            )}</td>`,
        )
        .join("")}${[0, 1, 2]
        .map(
          (j) =>
            `<td>${summaryCell(
              m.map((x) => x.carry[j].value),
              m.length,
            )}</td>`,
        )
        .join("")}<td>${survival(10)}<br>${survival(20)}</td></tr>`;
    })
    .join("");
  const filter = $("analysisGroup").value,
    chosen =
      filter === "all"
        ? analysisGroups
        : analysisGroups.filter((g) => g.id === +filter);
  const cell = (x) =>
    x.value === null
      ? `<span class="muted">${esc(x.reason)}</span>`
      : `<span title="采样时刻 ${x.sample}s">${fmt(x.value)}</span>`;
  $("battleRows").innerHTML = chosen
    .flatMap((g) =>
      g.indices.map((i) => {
        const b = DATA.battles[i],
          m = all[i];
        return `<tr><td>${g.label}<br><button class="smallbtn" data-replay="${i}">查看第 ${i + 1} 场</button></td><td>${esc(b.label)}<br><small>${b.winner === "draw" ? "平局" : b.winner === (side === "my" ? "my" : "enemy") ? "胜" : "负"} · 末帧 ${fmt(b.times.at(-1))}s</small></td>${m.team.map((x) => `<td>${cell(x)}</td>`).join("")}${m.carry.map((x) => `<td>${cell(x)}</td>`).join("")}<td>${fmt(m.finalTeam)} / ${fmt(m.finalCarry)}</td><td>${fmt(m.firstCast)} / ${fmt(m.firstSkill)} / ${m.death === null ? "未记录死亡" : fmt(m.death)}</td></tr>`;
      }),
    )
    .join("");
  $("groupConfigs").innerHTML = chosen
    .map(
      (g) =>
        `<details><summary>${g.label} · 对手 ${g.opponent} · 配置</summary><pre>${esc(g.request ? JSON.stringify(g.request, null, 2) : "没有完整 request，无法确认阵容、装备、站位相同，本场不与其他记录自动合并。")}</pre></details>`,
    )
    .join("");
}
$("analysisSide").onchange = setupAnalysis;
$("analysisCarry").onchange = renderAnalysis;
$("analysisGroup").onchange = renderAnalysis;
$("groupSummary").onclick = (e) => {
  const b = e.target.closest("[data-group]");
  if (b) {
    $("analysisGroup").value = b.dataset.group;
    renderAnalysis();
  }
};
$("battleRows").onclick = (e) => {
  const b = e.target.closest("[data-replay]");
  if (b) {
    $("trial").value = b.dataset.replay;
    load(+b.dataset.replay);
    const side = $("analysisSide").value,
      api = $("analysisCarry").value;
    const i = battle.sides[side].findIndex((u) => u.initial && u.api === api);
    if (i >= 0) selectUnit(side, i);
    $("replayControls").scrollIntoView({ behavior: "smooth" });
  }
};
$("exportSession").onclick = async () => {
  try {
    await downloadSession(DATA.battles.map((b) => b.original));
  } catch (e) {
    $("importStatus").textContent = "导出失败：" + e.message;
  }
};
setupAnalysis();
