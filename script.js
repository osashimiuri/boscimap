require([
  "esri/WebMap",
  "esri/WebScene",
  "esri/views/MapView",
  "esri/views/SceneView",
  "esri/Graphic",
  "esri/widgets/Legend",
  "esri/symbols/support/symbolUtils",
  "esri/renderers/SimpleRenderer",
  "esri/symbols/PointSymbol3D",
  "esri/symbols/IconSymbol3DLayer",
  "esri/symbols/callouts/LineCallout3D",
  "esri/core/reactiveUtils"
], function(
  WebMap, WebScene, MapView, SceneView, Graphic, Legend, symbolUtils,
  SimpleRenderer, PointSymbol3D, IconSymbol3DLayer, LineCallout3D,
  reactiveUtils
) {

  // --- 1. マップ定義 ---
  const webMap2D = new WebMap({portalItem: { id: "fef70d22c8bd4545be008db3c813117c" }});
  const webScene3D = new WebScene({portalItem: { id: "673f14dd49224af4b7b0d8b87011266b"}});
  
  let activeView = new MapView({
    container: "viewDiv",
    map: webMap2D,
    zoom: 15,
    highlightOptions: {color: [255, 0, 0], haloOpacity: 1, fillOpacity: 0.3},
    popup: {autoOpenEnabled: false}
  });
  
  let is3D = false; 
  let activeLegend = null;
  let activeClickHandle = null;
  let activeHighlightHandle = null;
  let highlightedObjectId = null; 
  let isProgrammaticScroll = false; 

  // --- 2. 初期化 ---
  async function initializeApp() {
    // UI設定を最優先（地図ロード待ち回避）
    setupStaticUI();

    try {
      await Promise.all([webMap2D.load(), webScene3D.load()]);
    } catch (error) {
      console.error("マップ読み込み失敗", error);
    }
    await activeView.when();

    updateMapFilter(); 
    setupViewDependentUI(activeView);
    
    addSymbolToCategoryChips();
    addSymbolToResourceList();
  }

  // --- 3. UI設定 (静的) ---
  function setupStaticUI() {
    // 3D/2D切り替え
    const btn3d = document.getElementById("3d-btn");
    const btn2d = document.getElementById("2d-btn");
    if(btn3d) btn3d.addEventListener("click", () => switchView(true));
    if(btn2d) btn2d.addEventListener("click", () => switchView(false));
    
    // 背景地図切り替え
    const whiteMapBtn = document.getElementById("white-map-btn");
    const satelliteBtn = document.getElementById("satellite-btn");
    const toggleBasemap = (showSatellite) => {
        const title = "衛星画像（World Imagery）";
        const l2d = webMap2D.allLayers.find(l => l.title === title);
        const l3d = webScene3D.allLayers.find(l => l.title === title);
        if(l2d) l2d.visible = showSatellite;
        if(l3d) l3d.visible = showSatellite;
        
        if(showSatellite && satelliteBtn && whiteMapBtn){ 
            satelliteBtn.classList.add("active"); whiteMapBtn.classList.remove("active"); 
        } else if(whiteMapBtn && satelliteBtn) { 
            whiteMapBtn.classList.add("active"); satelliteBtn.classList.remove("active"); 
        }
    };
    if(whiteMapBtn) whiteMapBtn.addEventListener("click", () => toggleBasemap(false));
    if(satelliteBtn) satelliteBtn.addEventListener("click", () => toggleBasemap(true));

    // 防災情報パネルボタン
    const menuBtn = document.getElementById("menu-btn");
    const controlPanel = document.getElementById("control-panel");
    if (menuBtn && controlPanel) {
        menuBtn.addEventListener("click", () => {
            controlPanel.style.display = "flex"; 
        });
    }

    const closePanelBtn = document.getElementById("close-panel-btn");
    if (closePanelBtn && controlPanel) {
        closePanelBtn.addEventListener("click", () => {
            controlPanel.style.display = "none";
        });
    }

    // ハザードマップ重ねるボタン
    const openHazardBtn = document.getElementById("open-hazard-btn");
    if (openHazardBtn && controlPanel) {
        openHazardBtn.addEventListener("click", () => {
            controlPanel.style.display = "flex";
            const hazardTab = document.getElementById("hazard-tab");
            if(hazardTab) hazardTab.click();
            highlightHazardGroup(currentCategory);
        });
    }

    // タブ切り替え
    const tabs = ["hazard", "resource"];
    tabs.forEach(tab => {
        const tabBtn = document.getElementById(`${tab}-tab`);
        if(tabBtn){
            tabBtn.addEventListener("click", () => {
                tabs.forEach(t => {
                    document.getElementById(`${t}-tab`).classList.remove("active");
                    document.getElementById(`${t}-content`).style.display = "none";
                });
                document.getElementById(`${tab}-tab`).classList.add("active");
                document.getElementById(`${tab}-content`).style.display = "block";
            });
        }
    });

    // レイヤーON/OFF設定
    const layerMapping = {
      "gaisui-filter": "gaisui_clip",       
      "naisui_R7-filter": "naisui_R7_clip",
      "takashio-filter": "takashio_clip",
      "tsunami-filter": "tsunami_clip",
      "kyukeisha_R7-filter": "kyukeisha_R7_clip",
      "ekijyouka-filter": "ekijyouka_clip",
      "jishindo-filter": "jishindo_clip",
      "shoshitsu-filter": "shoshitsu_clip",
      "TIIKIBOSAIKYOTEN-filter": "TIIKIBOSAIKYOTEN", 
      "koen-point-filter": "koen-point",
      "toilet-filter": "toilet", 
      "hamakkotoilet-filter": "hamakkotoilet",
      "syouboukigu-filter": "syouboukigu", 
      "douro12-filter": "douro12",
      "douro4-filter": "douro4", 
      "yusouro-filter": "yusouro",
      "suibu-filter": "suibu", 
      "kinkyu_kyusuisen-filter": "kinkyu_kyusuisen",
      "taishin_kyusuisen-filter": "taishin_kyusuisen", 
      "kyusuitank-filter": "kyusuitank",
      "haisuisou-filter": "haisuisou"
    };

    Object.entries(layerMapping).forEach(([checkId, layerTitle]) => {
      const checkbox = document.getElementById(checkId);
      if (!checkbox) return;
      checkbox.addEventListener("change", () => {
        [webMap2D, webScene3D].forEach(map => {
          const l = map.allLayers.find(layer => layer.title === layerTitle);
          if (l) l.visible = checkbox.checked;
        });
      });
    });

    setupCategoryFilter();
    setupFilterToggle();
    setupTutorial();
  }

  // --- 右パネル強調 ---
  function highlightHazardGroup(category) {
      document.querySelectorAll(".hazard-group").forEach(g => g.classList.remove("highlight"));
      let targetId = "";
      if (category === "mizu") targetId = "group-mizu";
      else if (category === "jiban") targetId = "group-jiban";
      else if (category === "jishin") targetId = "group-jishin";

      if (targetId) {
          const target = document.getElementById(targetId);
          if (target) {
              target.classList.add("highlight");
              setTimeout(() => { target.classList.remove("highlight"); }, 3000);
              target.scrollIntoView({ behavior: "smooth", block: "center" });
          }
      }
  }

  // --- 4. カテゴリフィルター ---
  let currentCategory = "all";
  let currentPhase = "all";
  let isHeartFilterOn = false;
  let isActionFilterOn = false;

  const phaseKeywords = {
    prior: ["備蓄", "水", "食料", "ハザードマップ", "訓練", "家具", "固定", "ガラス", "ブロック塀", "散歩", "確認", "話し合い", "家族", "連絡", "知る", "学ぶ", "準備", "日頃", "枕元", "靴", "備え", "アプリ", "登録"],
    during: ["逃げる", "避難", "高台", "走る", "垂直", "2階", "3階", "浸水", "揺れ", "机の下", "守る", "火", "消火", "煙", "119", "110", "通報", "助けて", "声かけ", "安否", "ライト", "懐中電灯", "停電", "ブレーカー"],
    recovery: ["片付け", "掃除", "泥", "ゴミ", "ボランティア", "助け合い", "協力", "炊き出し", "避難所", "トイレ", "衛生", "薬", "病院", "給水", "復旧", "再開", "つながり", "励まし", "絆", "相談", "申請"]
  };

  // --- ★修正完了：お気に入りボタンも確実に動くように改修 ---
  function setupCategoryFilter() {
    // 1. ハザード種別のチップ
    document.querySelectorAll(".chip[data-cat]").forEach(chip => {
      chip.onclick = () => { // onclickに変更
        document.querySelectorAll(".chip[data-cat]").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        currentCategory = chip.dataset.cat;
        updateMapFilter();
      };
    });

    // 2. 行動フェーズのチップ
    document.querySelectorAll(".chip[data-phase]").forEach(chip => {
      chip.onclick = () => { // onclickに変更
        document.querySelectorAll(".chip[data-phase]").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        currentPhase = chip.dataset.phase;
        updateMapFilter();
      };
    });

    // 3. お気に入り（ハート）ボタン
    const heartBtn = document.getElementById("filter-heart-btn");
    if(heartBtn){
        heartBtn.onclick = () => {
          isHeartFilterOn = !isHeartFilterOn; // フラグを反転
          
          // 見た目の切り替え
          if (isHeartFilterOn) {
            heartBtn.classList.add("active");
            heartBtn.innerHTML = "💖 印象的"; // アイコンを変化させる！
          } else {
            heartBtn.classList.remove("active");
            heartBtn.innerHTML = "♡ 印象的";
          }
          updateMapFilter();
        };
    }

    // 4. アクションボタン
    const actionBtn = document.getElementById("filter-action-btn");
    if(actionBtn){
        actionBtn.onclick = () => {
          isActionFilterOn = !isActionFilterOn; // フラグを反転
          
          // 見た目の切り替え
          if (isActionFilterOn) {
            actionBtn.classList.add("active");
            actionBtn.innerHTML = "⭐ 実践したい"; // アイコンを変化！
          } else {
            actionBtn.classList.remove("active");
            actionBtn.innerHTML = "✨ 実践したい";
          }
          updateMapFilter();
        };
    }
  }

  // --- フィルター適用 ---
  function updateMapFilter() {
    let whereClauses = [];
    const jishinSQL = "(field_24 LIKE '%震度%' OR field_24 LIKE '%火災%')";
    const jibanSQL  = "(field_24 LIKE '%土砂災害%' OR field_24 LIKE '%液状化%')";
    const mizuSQL   = "(field_24 LIKE '%洪水%' OR field_24 LIKE '%高潮%' OR field_24 LIKE '%津波%')";

    if (currentCategory === "jishin") whereClauses.push(jishinSQL);
    else if (currentCategory === "jiban") whereClauses.push(`${jibanSQL} AND NOT ${jishinSQL}`);
    else if (currentCategory === "mizu") whereClauses.push(`${mizuSQL} AND NOT ${jishinSQL} AND NOT ${jibanSQL}`);

    if (currentPhase !== "all") {
        const keywords = phaseKeywords[currentPhase];
        const keywordConditions = keywords.map(kw => 
            `(Message LIKE '%${kw}%' OR collage LIKE '%${kw}%' OR Mabling LIKE '%${kw}%')`
        ).join(" OR ");
        whereClauses.push(`(${keywordConditions})`);
    }

    let savedIds = [];
    const savedHearts = JSON.parse(localStorage.getItem("bousai_hearts") || "[]");
    const savedActions = JSON.parse(localStorage.getItem("bousai_actions") || "[]");

    if (isHeartFilterOn && isActionFilterOn) {
        savedIds = [...new Set([...savedHearts, ...savedActions])];
    } else if (isHeartFilterOn) {
        savedIds = savedHearts;
    } else if (isActionFilterOn) {
        savedIds = savedActions;
    }

    if ((isHeartFilterOn || isActionFilterOn)) {
        if (savedIds.length > 0) {
            whereClauses.push(`objectid IN (${savedIds.join(",")})`);
        } else {
            whereClauses.push("1=0"); 
        }
    }

    const finalSQL = whereClauses.length > 0 ? whereClauses.join(" AND ") : "1=1";

    [webMap2D, webScene3D].forEach(map => {
      const artPins = map.allLayers.find(l => l.title === "survey");
      if (artPins) artPins.definitionExpression = finalSQL;
    });

    const artPinsLayer = activeView.map.allLayers.find(l => l.title === "survey");
    activeView.whenLayerView(artPinsLayer).then(lv => {
      updateSidebarList(lv, artPinsLayer, activeView);
    });
    updateHeaderStats();
  }

  async function updateHeaderStats() {
    const savedHearts = JSON.parse(localStorage.getItem("bousai_hearts") || "[]");
    const savedActions = JSON.parse(localStorage.getItem("bousai_actions") || "[]");
    const heartEl = document.getElementById("header-heart-count");
    const actionEl = document.getElementById("header-action-count");
    if(heartEl) heartEl.textContent = savedHearts.length;
    if(actionEl) actionEl.textContent = savedActions.length;

    const viewCountEl = document.getElementById("view-count");
    if (viewCountEl) {
        const viewedList = JSON.parse(localStorage.getItem("bousai_viewed") || "[]");
        const viewedCount = viewedList.length;
        const layer = webMap2D.allLayers.find(l => l.title === "survey");
        let totalCount = "?";
        if (layer) {
            try {
                await layer.load();
                totalCount = await layer.queryFeatureCount({ where: "1=1" });
            } catch (e) {
                console.error("作品数の取得に失敗", e);
            }
        }
        viewCountEl.textContent = `${viewedCount}/${totalCount}`;
    }
  }

  // --- 5. シンボル表示 ---
  const catMap = { "jishin": "地震", "jiban": "地盤", "mizu": "水" };

  async function addSymbolToCategoryChips() {
    const layer = webMap2D.allLayers.find(l => l.title === "survey");
    if (!layer) return;
    await layer.load();
    const renderer = layer.renderer;
    if (!renderer || !renderer.uniqueValueInfos) return;

    const chips = document.querySelectorAll('.chip[data-cat]');
    for (const chip of chips) {
      const category = chip.dataset.cat;
      if (category === "all") continue; 
      const info = renderer.uniqueValueInfos.find(i => i.value === catMap[category]);
      if (info && info.symbol) {
        const existing = chip.querySelector(".symbol-preview");
        if(existing) existing.remove();
        const symbolElement = await symbolUtils.renderPreviewHTML(info.symbol, { size: 18 });
        symbolElement.classList.add('symbol-preview');
        chip.prepend(symbolElement);
      }
    }
    await injectSymbolToHeader("group-mizu", "mizu", renderer);
    await injectSymbolToHeader("group-jiban", "jiban", renderer);
    await injectSymbolToHeader("group-jishin", "jishin", renderer);
  }

  async function injectSymbolToHeader(groupId, catKey, renderer) {
    const group = document.getElementById(groupId);
    if (!group) return;
    const header = group.querySelector(".hazard-group-header");
    if (!header) return;
    const info = renderer.uniqueValueInfos.find(i => i.value === catMap[catKey]);
    if (info && info.symbol) {
      const existing = header.querySelector(".symbol-preview");
      if(existing) existing.remove();
      const symbolElement = await symbolUtils.renderPreviewHTML(info.symbol, { size: 24 });
      symbolElement.classList.add('symbol-preview');
      header.prepend(symbolElement);
    }
  }

  async function addSymbolToResourceList() {
    const resourceOptions = document.querySelectorAll('#resource-filters .filter-option');
    for (const option of resourceOptions) {
      const checkbox = option.querySelector('input[type="checkbox"]');
      if (!checkbox) continue;
      const layerTitle = checkbox.id.replace('-filter', '');
      const layer = webMap2D.allLayers.find(l => l.title === layerTitle);
      if (layer) {
        await layer.load();
        if (layer.renderer) {
          let symbol = layer.renderer.symbol || layer.renderer.uniqueValueInfos?.[0]?.symbol || layer.renderer.classBreakInfos?.[0]?.symbol;
          if (symbol) {
            const symbolElement = await symbolUtils.renderPreviewHTML(symbol, { size: 16 });
            symbolElement.classList.add('symbol-preview');
            const container = option.querySelector('.symbol-and-label');
            if (container) {
                const existing = container.querySelector(".symbol-preview");
                if(existing) existing.remove();
                container.prepend(symbolElement);
            }
          }
        }
      }
    }
  }

  // --- 7. ビュー切り替え ---
  async function switchView(to3D) {
    if (is3D === to3D) return; 
    const viewpoint = activeView.viewpoint.clone();
    activeView.container = null;
    const redHighlightOptions = { color: [255, 0, 0], haloOpacity: 0.9, fillOpacity: 0.2 };

    if (to3D) {
      activeView = new SceneView({ 
          container: "viewDiv", 
          map: webScene3D, 
          viewpoint: viewpoint,
          highlightOptions: redHighlightOptions,
          popup: { autoOpenEnabled: false }
      });
      is3D = true;
      document.getElementById("3d-btn").classList.add("active");
      document.getElementById("2d-btn").classList.remove("active");
    } else {
      activeView = new MapView({ 
          container: "viewDiv", 
          map: webMap2D, 
          viewpoint: viewpoint,
          highlightOptions: redHighlightOptions,
          popup: { autoOpenEnabled: false }
      });
      is3D = false;
      document.getElementById("2d-btn").classList.add("active");
      document.getElementById("3d-btn").classList.remove("active");
    }
    await activeView.when(); 
    setupViewDependentUI(activeView);
  }

  // --- UI設定（ビュー依存） ---
  async function setupViewDependentUI(currentView) {
    if (activeLegend) { try { currentView.ui.remove(activeLegend); activeLegend.destroy(); } catch(e){} }
    if (activeClickHandle) activeClickHandle.remove();
    if (activeHighlightHandle) { activeHighlightHandle.remove(); activeHighlightHandle = null; }

    const legendTitleMapping = {
      "gaisui_clip": "川の水があふれる洪水（外水氾濫）",
      "naisui_R7_clip": "下水があふれる洪水（内水氾濫）",
      "takashio_clip": "高潮（浸水深）",
      "tsunami_clip": "津波（浸水深、慶長型地震）",
      "kyukeisha_R7_clip": "土砂災害",
      "ekijyouka_clip": "地盤の液状化（元禄型関東地震）",
      "jishindo_clip": "震度情報（元禄型関東地震）",
      "shoshitsu_clip": "地震火災（元禄型関東地震）",
      "TIIKIBOSAIKYOTEN": "地域防災拠点",
      "koen-point": "公園",
      "toilet": "公衆トイレ",
      "hamakkotoilet": "災害用ハマッコトイレ",
      "syouboukigu": "消防団器具置き場",
      "douro12": "避難に適する道路（幅12m以上）",
      "douro4": "避難に適さない道路（幅4m程度）",
      "yusouro": "緊急輸送路",
      "suibu": "水部",
      "kinkyu_kyusuisen": "緊急給水栓",
      "taishin_kyusuisen": "耐震給水栓",
      "kyusuitank": "災害用地下給水タンク",
      "haisuisou": "配水池・配水槽"
    };

    const operationalLayers = currentView.map.allLayers.filter(layer => {
      return layer.title !== "survey" && 
             layer.title !== "衛星画像（World Imagery）" && 
             (layer.title.includes("_clip") || layer.type === "feature" || layer.type === "tile");
    });

    activeLegend = new Legend({
      view: currentView,
      layerInfos: operationalLayers.map(layer => { 
        const newTitle = legendTitleMapping[layer.title] || layer.title;
        return { layer: layer, title: newTitle }; 
      }).toArray()
    });
    currentView.ui.add(activeLegend, "bottom-right");

    const artPinsLayer = currentView.map.allLayers.find(l => l.title === "survey");
    if (!artPinsLayer) return;
    const layerView = await currentView.whenLayerView(artPinsLayer);

    const searchBtn = document.getElementById("search-area-btn");
    reactiveUtils.watch(() => currentView.stationary, (isStat) => {
      if (isStat) searchBtn.style.display = "block";
    });
    searchBtn.onclick = () => {
      updateSidebarList(layerView, artPinsLayer, currentView);
      searchBtn.style.display = "none";
    };

    const listContainer = document.getElementById("art-list-container");
    const newListContainer = listContainer.cloneNode(true);
    listContainer.parentNode.replaceChild(newListContainer, listContainer);
    newListContainer.addEventListener("scroll", () => {
      if (!isProgrammaticScroll) detectCenterCard(layerView, artPinsLayer);
    });
    
    await updateSidebarList(layerView, artPinsLayer, currentView);

    if (highlightedObjectId) {
        const targetCard = document.getElementById(`card-${highlightedObjectId}`);
        if (targetCard) {
            highlightCardInSidebar(highlightedObjectId, layerView, artPinsLayer);
        } else {
            highlightMapPin(highlightedObjectId, layerView);
        }
    }

    activeClickHandle = currentView.on("click", (event) => { 
      currentView.hitTest(event).then((res) => {
        const result = res.results.find(r => r.graphic.layer === artPinsLayer); 
        if (result) {
            const oid = result.graphic.attributes.objectid;
            highlightCardInSidebar(oid, layerView, artPinsLayer); 
        } else {
            highlightMapPin(null, layerView);
            document.querySelectorAll(".art-card").forEach(c => c.classList.remove("active-card"));
        }
      });
    });  
  }

  function extractAddressee(message) {
    if (!message) return "地域のみんなへ";
    const limitText = message.substring(0, 15);
    const index = limitText.indexOf("へ");
    if (index !== -1) return limitText.substring(0, index + 1);
    return "地域のみんなへ";
  }

  function highlightMapPin(oid, layerView) {
    if (activeHighlightHandle) { activeHighlightHandle.remove(); activeHighlightHandle = null; }
    activeView.graphics.removeAll(); 
    highlightedObjectId = oid;
    if (oid === null || !layerView) return;

    const query = { objectIds: [oid], outFields: ["*"], returnGeometry: true };
    layerView.layer.queryFeatures(query).then(res => {
        if (highlightedObjectId !== oid) return;
        if (res.features.length > 0) {
            const feature = res.features[0];
            const attrs = feature.attributes;
            const message = attrs.Message || attrs.message || "";
            const addressee = extractAddressee(message);
            if (!feature.geometry) return;

            const label = new Graphic({
                geometry: feature.geometry,
                symbol: {
                    type: "text", color: "#333333", text: "✉️ " + addressee, 
                    yoffset: 30, font: { size: 12, weight: "bold", family: "sans-serif" },
                    backgroundColor: [255, 255, 255, 0.95],
                    borderLineColor: [0, 121, 193, 0.5], borderLineSize: 1,
                    horizontalAlignment: "center"
                }
            });
            activeView.graphics.add(label);
            activeHighlightHandle = layerView.highlight(feature);
        }
    }).catch(error => { console.error("ラベル描画エラー:", error); });
  }

  async function updateSidebarList(layerView, layer, view) {
    const listContainer = document.getElementById("art-list-container");
    const query = layer.createQuery();
    query.geometry = view.extent; 
    query.where = layer.definitionExpression || "1=1";
    query.outFields = ["*"];
    
    try {
        const results = await layer.queryFeatures(query);
        listContainer.innerHTML = ""; 
        if (results.features.length === 0) {
            listContainer.innerHTML = `
                <div style="text-align:center; padding:30px; color:#888;">
                   <p>このエリアに条件に合う作品はありません</p>
                   <p style="font-size:0.8em;">地図を動かして<br>「再検索」ボタンを押してください</p>
                </div>`;
            return;
        }

        for (const feature of results.features) {
            const oid = feature.attributes.objectid;
            const savedHearts = JSON.parse(localStorage.getItem("bousai_hearts") || "[]");
            const savedActions = JSON.parse(localStorage.getItem("bousai_actions") || "[]");
            let iconsHtml = "";
            if(savedHearts.includes(oid)) iconsHtml += " <span style='color:#ff69b4;'>💖</span>";
            if(savedActions.includes(oid)) iconsHtml += " <span style='color:#fbc02d;'>✨</span>";

            const card = document.createElement("div");
            card.className = "art-card";
            card.id = `card-${oid}`;
            card.innerHTML = `
                <img src="https://via.placeholder.com/200?text=..." class="art-card-img" id="img-${oid}">
                <div class="art-card-info">
                    <div class="art-title">作者：
                        ${feature.attributes.field_25 || "作者不明"}
                        <span style="float:right; font-size:0.8em;">${iconsHtml}</span>
                    </div>
                </div>
            `;
            card.addEventListener("click", () => {
              highlightCardInSidebar(oid, layerView, layer);
              setTimeout(() => { window.location.href = `detail.html?id=${oid}`; }, 300);
            });
            listContainer.appendChild(card);
            layer.queryAttachments({ objectIds: [oid] }).then(attachments => {
                if (attachments[oid]?.length > 0) document.getElementById(`img-${oid}`).src = attachments[oid][0].url;
            });
        }

        if (results.features.length === 1) {
            const onlyOid = results.features[0].attributes.objectid;
            setTimeout(() => { highlightCardInSidebar(onlyOid, layerView, layer); }, 100);
        }
    } catch (e) { 
        console.error("リスト生成エラー:", e);
        listContainer.innerHTML = "<p>読み込みエラーが発生しました</p>";
    }
  }

  function detectCenterCard(layerView, layer) {
      const container = document.getElementById("art-list-container");
      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      let centerCard = null; let minDistance = Infinity;
      document.querySelectorAll(".art-card").forEach(card => {
          const rect = card.getBoundingClientRect();
          const dist = Math.abs((rect.top + rect.height / 2) - centerY);
          if (dist < minDistance) { minDistance = dist; centerCard = card; }
      });
      if (centerCard) {
          const oid = parseInt(centerCard.id.replace('card-', ''));
          if (oid !== highlightedObjectId) {
            document.querySelectorAll(".art-card").forEach(c => c.classList.remove("active-card"));
            centerCard.classList.add("active-card");
            highlightMapPin(oid, layerView);
          }
      }
  }

  function highlightCardInSidebar(oid, layerView, layer) { 
      isProgrammaticScroll = true;
      const target = document.getElementById(`card-${oid}`);
      if (target) {
          document.querySelectorAll(".art-card").forEach(c => c.classList.remove("active-card"));
          target.classList.add("active-card");
          target.scrollIntoView({ behavior: "smooth", block: "center" });
          highlightMapPin(oid, layerView);
          setTimeout(() => { isProgrammaticScroll = false; }, 800);
      }
  }

  // --- ★修正完了：重複実行を防ぐ最強のトグル機能 ---
  function setupFilterToggle() {
    const header = document.querySelector(".filter-main-header");
    const content = document.querySelector(".filter-content");
    const icon = document.querySelector(".toggle-icon");

    if (header && content && icon) {
      // ★ここがポイント！
      // addEventListener だと命令が積み重なってしまうので、
      // .onclick を使って「命令は常に1つ」に上書きします。
      header.onclick = () => {
        content.classList.toggle("closed");
        icon.classList.toggle("closed");
      };
    }
  }

  // --- ★チュートリアル機能（修正版） ---
  function setupTutorial() {
    const overlay = document.getElementById("tutorial-overlay");
    const helpBtn = document.getElementById("header-help-btn");
    
    // HTMLのIDに合わせて修正しました
    const skipBtn = document.getElementById("skip-btn"); 
    const nextBtn = document.getElementById("next-btn");
    
    // ページ番号（counterEl）に関するコードは削除しました

    const imgEl = document.getElementById("tutorial-img");
    const titleEl = document.getElementById("tutorial-title");
    const descEl = document.getElementById("tutorial-desc");
    
    // ドットの取得（HTMLのクラス名 "dot" に合わせました）
    const dots = document.querySelectorAll(".tutorial-dots .dot");

    if (!overlay) return;

    // 表示する内容データ
    const steps = [
      {
        title: "防災行動マップについて",
        desc: "作品鑑賞を通じて地域の人々のメッセージに触れる地図です。<br>作品には、<strong>「大切な誰かを守りたい」という</strong><br><strong>作者のメッセージ</strong>が込められています。",
        img: "tutorial_01.png" 
      },
      {
        title: "作品を絞り込む",
        desc: "「ハザード種別」や「行動フェーズ」ボタンで<br>今見たい作品だけを表示できます。",
        img: "tutorial_02.png"
      },
      {
        title: "地図を重ねる",
        desc: "右上の「防災情報」ボタンを押すと、<br>実際のハザードマップを地図に重ねて確認できます。",
        img: "tutorial_03.png"
      },
      {
        title: "物語に触れる",
        desc: "作品をタップすると詳細画面へ。<br>作者のメッセージや、隠された防災のヒントを鑑賞しましょう。",
        img: "tutorial_04.png"
      }
    ];

    let currentPage = 0;

    // ヘッダーの「？」ボタンを押したとき
    if(helpBtn) {
        helpBtn.addEventListener("click", () => {
            currentPage = 0;
            updateSlide();
            overlay.style.display = "flex";
        });
    }

    // スキップボタン
    if(skipBtn) {
        skipBtn.addEventListener("click", () => { overlay.style.display = "none"; });
    }

    // 次へボタン
    if(nextBtn) {
        nextBtn.addEventListener("click", () => {
            if (currentPage < steps.length - 1) {
                currentPage++;
                updateSlide();
            } else {
                overlay.style.display = "none";
            }
        });
    }

    function updateSlide() {
        if (!titleEl || !descEl || !imgEl) return;
        const step = steps[currentPage];
        titleEl.textContent = step.title;
        descEl.innerHTML = step.desc;
        
        // ページ番号の更新処理は削除しました

        const dummyImage = "https://via.placeholder.com/400x300?text=Image+" + (currentPage + 1);
        imgEl.src = step.img; 
        imgEl.onerror = () => { imgEl.src = dummyImage; };

        // ドットの更新
        dots.forEach((d, i) => { d.classList.toggle("active", i === currentPage); });

        // 最後のページならボタンの文字を変える
        if (nextBtn) {
            nextBtn.textContent = (currentPage === steps.length - 1) ? "完了" : "次へ ＞";
        }
    }
  }

  initializeApp();
});
