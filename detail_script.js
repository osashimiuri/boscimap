document.addEventListener("DOMContentLoaded", function() {

  // --- 1. チュートリアル機能 ---
  function setupDetailTutorial() {
    const overlay = document.getElementById("detail-tutorial-overlay");
    const imgEl = document.getElementById("dt-img");
    const titleEl = document.getElementById("dt-title");
    const descEl = document.getElementById("dt-desc");
    const nextBtn = document.getElementById("dt-next-btn");
    const dots = document.querySelectorAll(".dt-dot");
    const helpBtn = document.getElementById("detail-help-btn");

    if (!overlay) return;

    const steps = [
      {
        title: "ようこそ",
        desc: "鑑賞するアート作品には、<br>作者が見つけたこの場所の<strong>災害リスク</strong>と<br>それに対する<strong>防災行動</strong>が隠されています。",
        img: "tutorial_d_01.png"
      },
      {
        title: "災害リスク",
        desc: "背景の模様には<strong>『マーブリング』技法</strong>が使われ、作者が見つけた災害リスクが表現されています。",
        img: "tutorial_d_02.png"
      },
      {
        title: "防災行動",
        desc: "はられた図形には<strong>『コラージュ』技法</strong>が使われ、危険から身を守るための大切な行動が表現されています。",
        img: "tutorial_d_03.png"
      },
      {
        title: "鑑賞のしかた",
        desc: "上から順番に鑑賞を進め、作品に込められた<strong>作者のメッセージ</strong>を受け取りましょう。",
        img: "tutorial_d_04.png"
      }
    ];

    let currentPage = 0;
    const hasSeen = localStorage.getItem("has_seen_detail_tutorial");
    if (!hasSeen) {
        updateSlide();
        overlay.style.display = "flex";
    } else {
        overlay.style.display = "none";
    }

    if(helpBtn) {
        helpBtn.addEventListener("click", () => {
            currentPage = 0;
            updateSlide();
            overlay.style.display = "flex";
        });
    }

    if(nextBtn) {
        nextBtn.onclick = () => {
            if (currentPage < steps.length - 1) {
                currentPage++;
                updateSlide();
            } else {
                localStorage.setItem("has_seen_detail_tutorial", "true");
                closeTutorial();
            }
        };
    }

    function closeTutorial() {
      overlay.style.animation = "fadeOut 0.3s forwards";
      setTimeout(() => {
        overlay.style.display = "none";
        overlay.style.animation = "";
      }, 300);
    }

    function updateSlide() {
      const step = steps[currentPage];
      if(titleEl) titleEl.innerHTML = step.title;
      if(descEl) descEl.innerHTML = step.desc;
      if(imgEl) {
          imgEl.src = step.img;
          imgEl.onerror = () => { imgEl.src = "https://via.placeholder.com/400x300?text=Guide+" + (currentPage + 1); };
      }
      dots.forEach((d, i) => d.classList.toggle("active", i === currentPage));
      if(nextBtn) {
          if (currentPage === steps.length - 1) {
            nextBtn.innerText = "始める！";
          } else {
            nextBtn.innerText = "次へ ＞";
          }
      }
    }
  }

  setupDetailTutorial();
  
  // --- 2. 地図機能とメインロジック ---
  require([
    "esri/WebMap",
    "esri/views/MapView",
    "esri/layers/FeatureLayer",
    "esri/Graphic",
    "esri/widgets/Legend",
    "esri/geometry/geometryEngine",
    "esri/layers/support/LabelClass"
  ], function(WebMap, MapView, FeatureLayer, Graphic, Legend, geometryEngine, LabelClass) {
  
    // --- 変数定義 ---
    let featureAttributes = null; 
    let originalFeature = null; 
    
    // HTML要素
    let interactionPanel = document.getElementById("interaction-panel");
    let questMenuPanel = document.getElementById("quest-menu-panel");
    let artImageElement = document.getElementById("art-image");
    let artworkInfo = document.getElementById("artwork-info");
  
    // URLからIDを取得
    const urlParams = new URLSearchParams(window.location.search);
    const objectId = parseInt(urlParams.get("id"));

    if (!objectId) {
        alert("作品が見つかりませんでした。マップに戻ります。");
        window.location.href = "index.html";
        return;
    }

    const viewedList = JSON.parse(localStorage.getItem("bousai_viewed") || "[]");
    if (!viewedList.includes(objectId)) {
        viewedList.push(objectId);
        localStorage.setItem("bousai_viewed", JSON.stringify(viewedList));
    }
  
    // WebMap読み込み
    const webmap = new WebMap({ portalItem: { id: "fef70d22c8bd4545be008db3c813117c" } });
    const view = new MapView({
      container: "surrounding-map",
      map: webmap,
      ui: { components: ["zoom"] }
    });

    const artPinsLayer = new FeatureLayer({
      url: "https://services2.arcgis.com/xpOLkBdwWTLJMFA7/arcgis/rest/services/survey123_cff62fc5070c4f468b2c9269d5b2535f/FeatureServer/0"
    });
  
    const allHazardsDef = {
        "洪水": { title: "川の水があふれる洪水（外水氾濫）", layerKeyword: "gaisui", icon: "" },
        "内水": { title: "下水があふれる洪水（内水氾濫）", layerKeyword: "naisui", icon: "" },
        "高潮": { title: "高潮（浸水深）", layerKeyword: "takashio", icon: "" },
        "津波": { title: "津波（浸水深、慶長型地震）", layerKeyword: "tsunami", icon: "" },
        "土砂": { title: "土砂災害", layerKeyword: "kyukeisha", icon: "" },
        "液状化": { title: "地盤の液状化（元禄型関東地震）", layerKeyword: "ekijyouka", icon: "" },
        "震度": { title: "震度情報（元禄型関東地震）", layerKeyword: "jishindo", icon: "" },
        "火災": { title: "地震火災（元禄型関東地震）", layerKeyword: "shoshitsu", icon: "" }
    };

    const phaseKeywords = {
      prior: ["備蓄", "水", "食料", "ハザードマップ", "訓練", "家具", "固定", "ガラス", "ブロック塀", "散歩", "確認", "話し合い", "家族", "連絡", "知る", "学ぶ", "準備", "日頃", "枕元", "靴", "備え", "アプリ", "登録"],
      during: ["逃げる", "避難", "高台", "走る", "垂直", "2階", "3階", "浸水", "揺れ", "机の下", "守る", "火", "消火", "煙", "119", "110", "通報", "助けて", "声かけ", "安否", "ライト", "懐中電灯", "停電", "ブレーカー"],
      recovery: ["片付け", "掃除", "泥", "ゴミ", "ボランティア", "助け合い", "協力", "炊き出し", "避難所", "トイレ", "衛生", "薬", "病院", "給水", "復旧", "再開", "つながり", "励まし", "絆", "相談", "申請"]
    };

    const allResourcesDef = {
        "避難": { 
            title: "避難所と緊急輸送路（逃げる場所と道）", 
            layerTitles: ["TIIKIBOSAIKYOTEN", "douro12", "yusouro"], // 全部入りセット！
            icon: "🏃" 
        },

        川: { title: "河川", layerTitles: ["suibu"], icon: "" },
        "拠点": { title: "地域防災拠点（避難所）", layerTitles: ["TIIKIBOSAIKYOTEN"], icon: "" },
        "学校": { title: "地域防災拠点（避難所）", layerTitles: ["TIIKIBOSAIKYOTEN"], icon: "" },
        
        "公園": { title: "公園", layerTitles: ["koen-point"], icon: "" },
        "広場": { title: "公園", layerTitles: ["koen-point"], icon: "" },
        
        "トイレ": { title: "災害用・公衆トイレ", layerTitles: ["toilet", "hamakkotoilet"], icon: "" },
        "便所": { title: "災害用・公衆トイレ", layerTitles: ["toilet", "hamakkotoilet"], icon: "" },
        
        "水": { title: "給水スポット（給水栓・タンク）", layerTitles: ["kinkyu_kyusuisen", "taishin_kyusuisen", "kyusuitank", "haisuisou"], icon: "" },
        "給水": { title: "給水スポット（給水栓・タンク）", layerTitles: ["kinkyu_kyusuisen", "taishin_kyusuisen", "kyusuitank", "haisuisou"], icon: "" },
        
        "道路": { title: "広い道路・緊急輸送路", layerTitles: ["douro12", "yusouro"], icon: "" },
        "動": { title: "広い道路・緊急輸送路", layerTitles: ["douro12", "yusouro"], icon: "" },
        "逃": { title: "広い道路・緊急輸送路", layerTitles: ["douro12", "yusouro"], icon: "" },
        "避難": { title: "広い道路・緊急輸送路", layerTitles: ["douro12", "yusouro"], icon: "" },

        "消防": { title: "消防団器具置き場", layerTitles: ["syouboukigu"], icon: "" },
        "火": { title: "消防団器具置き場", layerTitles: ["syouboukigu"], icon: "" }
    };
  
    // --- データの読み込み ---
    artPinsLayer.queryFeatures({
      where: `objectid = ${objectId}`,
      outFields: ["*"],
      returnGeometry: true
    }).then(results => {
      
      showQuestMenu();
      
      if (results.features.length === 0) return;
  
      originalFeature = results.features[0]; 
      featureAttributes = originalFeature.attributes;
      
      if (artworkInfo) {
          artworkInfo.innerHTML = `<div class="simple-author-label">作者: ${featureAttributes.field_25 || "匿名"}</div>`;
      }

      setText("mabling-text", featureAttributes.Mabling);
      setText("collage-text", featureAttributes.collage);
      setText("author-message-text", featureAttributes.Message);

      artPinsLayer.queryAttachments({ objectIds: [objectId] }).then(attachments => {
        if (attachments[objectId] && attachments[objectId].length > 0) {
          artImageElement.src = attachments[objectId][0].url;
        }
      });
  
      view.when(() => {
        view.goTo({ target: originalFeature.geometry, zoom: 15 });
        const surveyLayer = webmap.allLayers.find(l => l.title === "survey");
        if (surveyLayer) {
            surveyLayer.definitionExpression = `objectid = ${objectId}`;
        }
        resetMapLayers();
      });
    });

    function setText(id, text) {
        const el = document.getElementById(id);
        if(el) el.textContent = text || "（コメントなし）";
    }

    // --- クエスト制御 ---
    window.showQuestMenu = function() {
      questMenuPanel.style.display = "block";
      interactionPanel.style.display = "none";
    };

    function resetMapLayers() {
        if(!webmap) return;
        webmap.allLayers.forEach(layer => {
            let isHazard = false;
            Object.values(allHazardsDef).forEach(def => {
                if (layer.title.includes(def.layerKeyword)) isHazard = true;
            });
            if (isHazard) {
                layer.visible = false;
            }
        });
    }
  
    window.startQuest = function(stepNum) {
      questMenuPanel.style.display = "none";
      interactionPanel.style.display = "flex";

      // 全隠し
      document.getElementById("split-layout-container").style.display = "none";
      document.getElementById("step3-content").style.display = "none";
      
      document.getElementById("step1-info").style.display = "none";
      document.getElementById("step2-info").style.display = "none";
      document.getElementById("step1-controls").style.display = "none";
      document.getElementById("step2-controls").style.display = "none";
      
      // ボタンエリア制御
      const btnArea1 = document.getElementById("step1-btn-area");
      if(btnArea1) btnArea1.style.display = "none";
      
      const infoBox = document.querySelector(".info-box-container");
      
      // タイトル要素
      const verifyTitle = document.querySelector(".verify-title");

      if (stepNum === 1) {
        // STEP1: 災害リスク（既存のまま）
        document.getElementById("split-layout-container").style.display = "flex";
        document.getElementById("step1-info").style.display = "block";
        document.getElementById("step1-controls").style.display = "block";
        if(btnArea1) btnArea1.style.display = "block";
        
        if(verifyTitle) verifyTitle.textContent = "▼ ハザードマップを重ねて解説を確認しよう";

        if(infoBox) infoBox.classList.remove("action-mode");

        resetMapLayers();
        generateHazardCheckboxes();
        setText("mabling-text", featureAttributes.Mabling);

      } else if (stepNum === 2) {
        // ★STEP2: 防災行動（修正：資源チェックリスト）
        document.getElementById("split-layout-container").style.display = "flex";
        document.getElementById("step2-info").style.display = "block";
        document.getElementById("step2-controls").style.display = "block";
        document.getElementById("step2-btn-area").style.display = "block";

        // タイトル変更
        if(verifyTitle) verifyTitle.textContent = "▼ 防災資源を表示させてピン周辺の状況を確認しよう";

        if(infoBox) infoBox.classList.add("action-mode");

        resetMapLayers();
        setText("collage-text", featureAttributes.collage);
        
        // ★資源チェックボックス生成関数を呼び出し
        generateResourceCheckboxes();

      } else if (stepNum === 3) {
        // STEP3: 作者の想い（既存のまま）
        document.getElementById("step3-content").style.display = "block";
        
        setText("author-message-text", featureAttributes.Message);
        const signature = document.getElementById("author-name-signature");
        if(signature) signature.textContent = (featureAttributes.field_25 || "作者") + " より";
      }
    };

    // ★追加：STEP2用のチェックボックス生成関数
    function generateResourceCheckboxes() {
        const container = document.getElementById("step2-resource-check-area");
        if(!container || !featureAttributes) return;
        
        container.innerHTML = "";

        // コラージュの解説文（防災行動テキスト）を取得
        const actionText = featureAttributes.collage || ""; 
        
        // ヒットした資源を記録するセット（重複排除のため）
        const matchedResources = new Set();
        // マッチした定義キーを保存
        const addedKeys = new Set();

        Object.keys(allResourcesDef).forEach(keyword => {
            if (actionText.includes(keyword)) {
                const def = allResourcesDef[keyword];
                
                // 同じラベル（例：「水」と「給水」で同じ定義）が既に出ていればスキップ
                if (matchedResources.has(def.title)) return;
                
                matchedResources.add(def.title);
                addedKeys.add(keyword);

                const div = document.createElement("div");
                div.className = "hazard-check-item"; // デザインはSTEP1と同じものを流用
                const checkId = `chk-resource-${keyword}`;
                
                div.innerHTML = `
                    <input type="checkbox" id="${checkId}">
                    <label for="${checkId}">${def.icon} ${def.title}</label>
                `;
                
                container.appendChild(div);

                const checkbox = div.querySelector("input");
                checkbox.addEventListener("change", () => {
                    const isChecked = checkbox.checked;
                    // 定義されているレイヤータイトルを配列で回してON/OFF
                    def.layerTitles.forEach(title => {
                        const layer = webmap.allLayers.find(l => l.title === title);
                        if (layer) layer.visible = isChecked;
                    });
                });
            }
        });

        // 何もヒットしなかった場合のデフォルト表示（例：避難所だけ出す、またはメッセージ）
        if (matchedResources.size === 0) {
            container.innerHTML = "<p style='font-size:0.8em; color:#999; width:100%; text-align:center;'>※ 地図上に表示できる特定の防災資源キーワードはありません。<br>（右上のメニューから自由に地図を操作できます）</p>";
        }
    }

    function generateHazardCheckboxes() {
        const container = document.getElementById("step1-hazard-check-area");
        if(!container || !featureAttributes) return;
        
        container.innerHTML = "";

        const riskText = featureAttributes.field_24 || ""; 
        let hitCount = 0;

        Object.keys(allHazardsDef).forEach(key => {
            if (riskText.includes(key)) {
                const def = allHazardsDef[key];
                hitCount++;

                const div = document.createElement("div");
                div.className = "hazard-check-item";
                const checkId = `chk-hazard-${key}`;
                
                div.innerHTML = `
                    <input type="checkbox" id="${checkId}">
                    <label for="${checkId}">${def.icon} ${def.title}</label>
                `;
                
                container.appendChild(div);

                const checkbox = div.querySelector("input");
                checkbox.addEventListener("change", () => {
                    const isChecked = checkbox.checked;
                    webmap.allLayers.forEach(l => {
                        if (l.title.includes(def.layerKeyword)) {
                            l.visible = isChecked;
                        }
                    });
                });
            }
        });

        if (hitCount === 0) {
            container.innerHTML = "<p style='font-size:0.8em; color:#999;'>※特に関連するハザードマップ情報はありません</p>";
        }
    }
  
    window.finishQuest = function(stepNum) {
      showQuestMenu(); 

      // 解説テキストを追加する関数（重複防止付き）
      const addResultText = (item, text) => {
          if(!item.querySelector(".quest-result-text")) {
              const div = document.createElement("div");
              div.className = "quest-result-text";
              div.innerHTML = text;
              item.appendChild(div);
          }
      };

      // ★再挑戦機能を付与する関数
      const enableReplay = (item, step) => {
          // カード全体をクリックしたら、そのステップを開始する
          item.onclick = function() {
              startQuest(step);
          };
          // ツールチップ（PC用）
          item.title = "クリックしてもう一度確認する";
      };

      if (stepNum === 1) {
        const item1 = document.getElementById("quest-item-1");
        const btn1 = item1.querySelector("button");
        
        // デザイン変更
        item1.classList.add("completed"); 
        item1.classList.remove("active"); 
        if(btn1) btn1.style.display = "none"; // ボタンを消す

        // 解説を追加
        const answerText = featureAttributes.Mabling || "災害リスク";
        addResultText(item1, answerText);
        
        // ★クリックで再開できるようにする
        enableReplay(item1, 1);

        // STEP2解放
        const item2 = document.getElementById("quest-item-2");
        const btn2 = document.getElementById("btn-step2");
        if(item2 && btn2) {
            item2.classList.remove("locked");
            item2.classList.add("active"); // 次のステップをアクティブに
            btn2.disabled = false;
            btn2.innerText = "挑戦する ＞";
        }

      } else if (stepNum === 2) {
        const item2 = document.getElementById("quest-item-2");
        const btn2 = item2.querySelector("button");
        
        item2.classList.add("completed");
        item2.classList.remove("active"); 
        if(btn2) btn2.style.display = "none"; 
        
        const answerText = featureAttributes.collage || "防災行動";
        addResultText(item2, answerText);

        // ★クリックで再開できるようにする
        enableReplay(item2, 2);

        // STEP3解放
        const item3 = document.getElementById("quest-item-3");
        const btn3 = document.getElementById("btn-step3");
        if(item3 && btn3) {
            item3.classList.remove("locked");
            item3.classList.add("active");
            btn3.disabled = false;
            btn3.innerText = "手紙を開く 💌";
        }

      } else if (stepNum === 3) {
        const item3 = document.getElementById("quest-item-3");
        const btn3 = document.getElementById("btn-step3");
        
        item3.classList.add("completed");
        item3.classList.remove("active");
        if(btn3) btn3.style.display = "none"; 

        const answerText = featureAttributes.Message || "作者からのメッセージ";
        addResultText(item3, answerText);

        // ★クリックで再開できるようにする（手紙をまた読める）
        enableReplay(item3, 3);

        // 右サイドバーに「近くの作品を見に行く」ボタンを表示
        const postArea = document.getElementById("post-quest-area");
        if(postArea) postArea.style.display = "block";
        
        const guide = document.querySelector(".appreciation-guide");
        if(guide) guide.style.display = "none";
        
      }
    };

    // --- おすすめ作品ロジック ---
    let nearbyView = null;
    let nearbyLayer = null;

    // --- 修正版：近くの作品を見に行く機能 ---
    window.goToNearbyWorks = function() {
        const btn = document.getElementById("find-nearby-btn");
        const overlay = document.getElementById("nearby-overlay");

        // 1. ボタンを「準備中」に変える
        if(btn) {
            btn.innerHTML = "⌛ 準備中...";
            btn.style.opacity = "0.7";
            btn.style.pointerEvents = "none"; 
        }

        // 2. まず画面を出す！
        if(overlay) {
            overlay.style.display = "flex";
            // 強制的に画面を描画させるおまじない
            void overlay.offsetWidth; 
        }

        // 3. 0.5秒待ってから地図の処理をする（これで画面が確実に出る！）
        setTimeout(function() {
            
            // A. まだ地図がないとき（初めて押したとき）
            if (!nearbyView) {
                const nearbyWebmap = new WebMap({ portalItem: { id: "fef70d22c8bd4545be008db3c813117c" } });
                
                nearbyView = new MapView({
                    container: "nearby-map-view",
                    map: nearbyWebmap,
                    center: originalFeature.geometry, 
                    zoom: 13, 
                    ui: { components: [] } 
                });
    
                nearbyView.when(() => {
                    nearbyLayer = nearbyWebmap.allLayers.find(l => l.title === "survey");
                    if (nearbyLayer) {
                        nearbyLayer.definitionExpression = "1=0";
                        const labelClass = new LabelClass({
                          symbol: {
                            type: "text", 
                            color: "#333333", 
                            haloColor: "white",
                            haloSize: 2,
                            font: { size: 10, weight: "bold", family: "sans-serif" },
                            backgroundColor: "rgba(255, 255, 255, 0.9)",
                            borderLineColor: "rgba(0, 0, 0, 0.1)",
                            borderLineSize: 1,
                            yoffset: 20,
                            verticalAlignment: "bottom"
                          },
                          labelPlacement: "above-center",
                          labelExpressionInfo: {
                            expression: `
                              var msg = $feature.Message;
                              var idx = Find("へ", msg);
                              if (idx > -1) { return Left(msg, idx + 1); } else { return "地域のみんなへ"; }
                            `
                          }
                        });
                        nearbyLayer.labelingInfo = [labelClass];
                        nearbyLayer.labelsVisible = true;
                    }
                    loadDualRecommendation();
                    
                    // ★地図ができたらボタンを元に戻す！
                    resetButton();
                });
    
                nearbyView.on("click", (event) => {
                  nearbyView.hitTest(event).then((res) => {
                    const result = res.results.find(r => r.graphic.layer === nearbyLayer || r.graphic.layer === nearbyView.graphics);
                    if (result) {
                      const oid = result.graphic.attributes.objectid;
                      if(oid) window.location.href = `detail.html?id=${oid}`;
                    }
                  });
                });
            
            } else {
                // B. もう地図があるとき（2回目以降）
                // ただボタンを戻すだけでOK！
                resetButton();
            }

        }, 500); // 500ミリ秒（0.5秒）しっかり待つ！
        
        // ボタンを元に戻す関数
        function resetButton() {
            if(btn) {
                btn.innerHTML = "🗺️ 次に鑑賞する作品を探す";
                btn.style.opacity = "1";
                btn.style.pointerEvents = "auto";
            }
        }
    };

    window.closeNearbyOverlay = function() {
        document.getElementById("nearby-overlay").style.display = "none";
    };

    function shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }

    function getRiskCategory(attrs) {
        const val = attrs.field_24 || "";
        if (val.includes("震度") || val.includes("火災")) return "jishin";
        if (val.includes("土砂災害") || val.includes("液状化")) return "jiban";
        if (val.includes("洪水") || val.includes("高潮") || val.includes("津波")) return "mizu";
        return "other";
    }

    function getPhaseCategory(attrs) {
        const text = (attrs.Message || "") + (attrs.collage || "") + (attrs.Mabling || "");
        for (const kw of phaseKeywords.prior) if (text.includes(kw)) return "prior";
        for (const kw of phaseKeywords.during) if (text.includes(kw)) return "during";
        for (const kw of phaseKeywords.recovery) if (text.includes(kw)) return "recovery";
        return "other";
    }

    function getRiskSQL(category) {
        if (category === "jishin") return "(field_24 LIKE '%震度%' OR field_24 LIKE '%火災%')";
        if (category === "jiban") return "(field_24 LIKE '%土砂災害%' OR field_24 LIKE '%液状化%')";
        if (category === "mizu") return "(field_24 LIKE '%洪水%' OR field_24 LIKE '%高潮%' OR field_24 LIKE '%津波%')";
        return "1=1";
    }

    function getPhaseSQL(phase) {
        const kws = phaseKeywords[phase];
        if (!kws) return "1=1";
        const conditions = kws.map(kw => `(Message LIKE '%${kw}%' OR collage LIKE '%${kw}%' OR Mabling LIKE '%${kw}%')`).join(" OR ");
        return `(${conditions})`;
    }

    function loadDualRecommendation() {
        const gridRisk = document.getElementById("grid-risk");
        const gridTime = document.getElementById("grid-time");
        
        gridRisk.innerHTML = "<p style='font-size:0.8em; color:#999;'>読み込み中...</p>";
        gridTime.innerHTML = "<p style='font-size:0.8em; color:#999;'>読み込み中...</p>";

        const myRisk = getRiskCategory(featureAttributes);
        const myPhase = getPhaseCategory(featureAttributes);
        const riskWhere = getRiskSQL(myRisk);
        const phaseWhere = getPhaseSQL(myPhase);

        const promises = [];
        const queryRisk = artPinsLayer.createQuery();
        queryRisk.where = `objectid <> ${objectId} AND ${riskWhere}`;
        queryRisk.returnGeometry = true;
        queryRisk.outFields = ["*"];
        queryRisk.num = 20; 
        promises.push(artPinsLayer.queryFeatures(queryRisk));

        const queryTime = artPinsLayer.createQuery();
        queryTime.where = `objectid <> ${objectId} AND ${phaseWhere}`;
        queryTime.returnGeometry = true;
        queryTime.outFields = ["*"];
        queryTime.num = 20; 
        promises.push(artPinsLayer.queryFeatures(queryTime));

        Promise.all(promises).then(results => {
            let riskCandidates = results[0].features;
            let timeCandidates = results[1].features;
            
            shuffleArray(riskCandidates);
            const riskFeatures = riskCandidates.slice(0, 2);

            const usedIds = riskFeatures.map(f => f.attributes.objectid);
            timeCandidates = timeCandidates.filter(f => !usedIds.includes(f.attributes.objectid));
            shuffleArray(timeCandidates);
            const timeFeatures = timeCandidates.slice(0, 2);
            
            gridRisk.innerHTML = "";
            gridTime.innerHTML = "";

            const allFeatures = [...riskFeatures, ...timeFeatures];
            const allIds = allFeatures.map(f => f.attributes.objectid);

            if (nearbyLayer) {
                if (allIds.length > 0) {
                    nearbyLayer.definitionExpression = `objectid IN (${allIds.join(",")})`;
                    addColoredNumberLabels(riskFeatures, timeFeatures);
                    zoomToFeatures(allFeatures);
                } else {
                    nearbyLayer.definitionExpression = "1=0"; 
                }
            }
            
            const createCompactCard = (container, feature, badgeText, badgeColor, indexNumber, badgeClass) => {
                const attrs = feature.attributes;
                const oid = attrs.objectid;
                const author = attrs.field_25 || "匿名";

                const item = document.createElement("div");
                item.className = "nearby-item compact";
                item.style.borderColor = badgeColor; 
                item.onclick = () => { window.location.href = `detail.html?id=${oid}`; };
                
                item.innerHTML = `
                    <div class="compact-thumb-box">
                      <div class="number-badge-float ${badgeClass}">${indexNumber}</div>
                      <img id="thumb-${oid}" class="compact-thumb" src="https://via.placeholder.com/150?text=Loading">
                    </div>
                    <div class="compact-info">
                        <div class="compact-author">👤 ${author}</div>
                    </div>
                `;
                container.appendChild(item);
                
                artPinsLayer.queryAttachments({ objectIds: [oid] }).then(attachments => {
                    const img = document.getElementById(`thumb-${oid}`);
                    if (attachments[oid] && attachments[oid].length > 0) {
                        img.src = attachments[oid][0].url;
                    } else {
                        img.src = "https://via.placeholder.com/150?text=No+Image";
                    }
                });
            };

            let count = 1;
            if(riskFeatures.length > 0) {
                riskFeatures.forEach(f => createCompactCard(gridRisk, f, "同じリスク", "#EE8972", count++, "badge-risk"));
            } else {
                gridRisk.innerHTML = "<p style='font-size:0.8em; color:#999; padding:5px;'>該当なし</p>";
            }

            if(timeFeatures.length > 0) {
                timeFeatures.forEach(f => createCompactCard(gridTime, f, "同じ時間", "#6BAA9F", count++, "badge-time"));
            } else {
                gridTime.innerHTML = "<p style='font-size:0.8em; color:#999; padding:5px;'>該当なし</p>";
            }
        });
    }

    function addColoredNumberLabels(riskGroup, timeGroup) {
        if (!nearbyView) return;
        nearbyView.graphics.removeAll();
        let count = 1;
        const drawLabel = (feature, bgColor) => {
            if (!feature.geometry) return;
            const textGraphic = new Graphic({
                geometry: feature.geometry,
                attributes: { objectid: feature.attributes.objectid },
                symbol: {
                    type: "text",
                    color: "white",
                    haloColor: "rgba(0,0,0,0.3)",
                    haloSize: "1px",
                    text: count.toString(),
                    xoffset: 0,
                    yoffset: -5, 
                    font: { size: 12, weight: "bold" },
                    backgroundColor: bgColor,
                    borderLineColor: "white",
                    borderLineSize: 1,
                }
            });
            nearbyView.graphics.add(textGraphic);
            count++;
        };
        riskGroup.forEach(f => drawLabel(f, "#EE8972"));
        timeGroup.forEach(f => drawLabel(f, "#6BAA9F"));
    }

    function zoomToFeatures(features) {
        if (!nearbyView || features.length === 0) return;
        const geometries = features.map(f => f.geometry).filter(g => g);
        if(geometries.length > 0) {
            nearbyView.goTo(geometries, { 
                padding: { top: 80, bottom: 80, left: 60, right: 60 },
                duration: 1000 
            }).catch(e => {});
        }
    }

    // --- 終了画面（花道・改） ---
    window.showFinalCTA = function() {
        document.getElementById("nearby-overlay").style.display = "none";
        document.getElementById("final-cta-overlay").style.display = "flex";
        
        const countSpan = document.getElementById("total-art-count");
        const bgContainer = document.getElementById("final-background");
        const layerUrl = "https://services2.arcgis.com/xpOLkBdwWTLJMFA7/arcgis/rest/services/survey123_cff62fc5070c4f468b2c9269d5b2535f/FeatureServer/0";

        bgContainer.innerHTML = "";

        require(["esri/rest/query", "esri/rest/support/Query", "esri/layers/FeatureLayer"], function(query, Query, FeatureLayer) {
            const q = new Query();
            q.where = "1=1";
            
            query.executeForCount(layerUrl, q).then(function(count){
                let current = 0;
                const timer = setInterval(() => {
                    current += Math.ceil(count / 20);
                    if (current >= count) {
                        current = count;
                        clearInterval(timer);
                    }
                    if(countSpan) countSpan.textContent = current;
                }, 50);
            });

            const layer = new FeatureLayer({ url: layerUrl });
            const floatQuery = layer.createQuery();
            // 今見ている作品（objectId）を除外
            floatQuery.where = `Message IS NOT NULL AND objectid <> ${objectId}`;
            floatQuery.outFields = ["objectid", "Message"];
            floatQuery.returnGeometry = false;
            floatQuery.num = 50; 

            layer.queryFeatures(floatQuery).then(function(results){
                const features = results.features;
                for (let i = features.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [features[i], features[j]] = [features[j], features[i]];
                }
                const selected = features.slice(0, 10);
                selected.forEach((feat, index) => {
                    const oid = feat.attributes.objectid;
                    const msg = feat.attributes.Message;
                    let toName = "地域のみんなへ";
                    const idx = msg.indexOf("へ");
                    if(idx > 0 && idx < 15) toName = msg.substring(0, idx+1);
                    toName = "💭 " + toName;
                    layer.queryAttachments({ objectIds: [oid] }).then(att => {
                        let imgSrc = "https://via.placeholder.com/120?text=Art";
                        if(att[oid] && att[oid].length > 0) imgSrc = att[oid][0].url;
                        createFloatingElement(bgContainer, imgSrc, toName, index);
                    });
                });
            });
        });
    };

    function createFloatingElement(container, imgSrc, text, index) {
        const div = document.createElement("div");
        div.className = "floating-card";
        div.innerHTML = `
            <div class="floating-bubble">${text}</div>
            <img src="${imgSrc}" class="floating-img">
        `;
        let randomLeft;
        if (index % 2 === 0) {
            randomLeft = Math.floor(Math.random() * 15) + 10; 
        } else {
            randomLeft = Math.floor(Math.random() * 15) + 75; 
        }
        const fixedDur = 15; 
        const delay = index * 3.0; 
        div.style.left = randomLeft + "%";
        div.style.animationDuration = fixedDur + "s";
        div.style.animationDelay = delay + "s";
        container.appendChild(div);
    }

    // --- ヘッダー更新機能 ---
    function updateHeaderStats() {
      const savedHearts = JSON.parse(localStorage.getItem("bousai_hearts") || "[]");
      const savedActions = JSON.parse(localStorage.getItem("bousai_actions") || "[]");
      const viewedList = JSON.parse(localStorage.getItem("bousai_viewed") || "[]");

      const heartEl = document.getElementById("header-heart-count");
      const actionEl = document.getElementById("header-action-count");
      const viewEl = document.getElementById("view-count");

      if (heartEl) heartEl.textContent = savedHearts.length;
      if (actionEl) actionEl.textContent = savedActions.length;
      if (viewEl) viewEl.textContent = viewedList.length; 
    }

    function setupReactionButtons() {
      const btnHeart = document.getElementById("btn-heart");
      const btnAction = document.getElementById("btn-action");
      
      updateHeaderStats();

      if (!btnHeart || !btnAction) return;

      const savedHearts = JSON.parse(localStorage.getItem("bousai_hearts") || "[]");
      const savedActions = JSON.parse(localStorage.getItem("bousai_actions") || "[]");

      if (savedHearts.includes(objectId)) {
          btnHeart.classList.add("active");
          btnHeart.innerHTML = '<span class="icon">💖</span> 共感した';
      }
      if (savedActions.includes(objectId)) {
          btnAction.classList.add("active");
          btnAction.innerHTML = '<span class="icon">✨</span> 実践したい';
      }

      btnHeart.addEventListener("click", () => {
          let list = JSON.parse(localStorage.getItem("bousai_hearts") || "[]");
          if (list.includes(objectId)) {
              list = list.filter(id => id !== objectId);
              btnHeart.classList.remove("active");
              btnHeart.innerHTML = '<span class="icon">🤍</span> 共感した';
          } else {
              list.push(objectId);
              btnHeart.classList.add("active");
              btnHeart.innerHTML = '<span class="icon">💖</span> 共感した';
          }
          localStorage.setItem("bousai_hearts", JSON.stringify(list));
          updateHeaderStats();
      });

      btnAction.addEventListener("click", () => {
          let list = JSON.parse(localStorage.getItem("bousai_actions") || "[]");
          if (list.includes(objectId)) {
              list = list.filter(id => id !== objectId);
              btnAction.classList.remove("active");
              btnAction.innerHTML = '<span class="icon">⭐</span> 実践したい';
          } else {
              list.push(objectId);
              btnAction.classList.add("active");
              btnAction.innerHTML = '<span class="icon">✨</span> 実践したい';
          }
          localStorage.setItem("bousai_actions", JSON.stringify(list));
          updateHeaderStats();
      });
    }

    setupReactionButtons();

    const findNearbyBtn = document.getElementById("find-nearby-btn");
    if (findNearbyBtn) {
        findNearbyBtn.addEventListener("click", goToNearbyWorks);
    }

  }); // require End
}); // DOMContentLoaded End
