/* =====================================================================
 * X-Change Google Sheets — 4ステップ最小セットアップ (v3.18.6)
 *
 * 【方針】
 *   各関数は数秒で終わる極軽量。各関数 1〜3 API 呼出のみ。
 *   全行走査・getLastRow・正規化・条件付き書式・補助シート作成は一切しない。
 *
 * 【実行順序】 Apps Script エディタで順番に実行:
 *   1. xchangeStep01_SetMonthlyBase()        ← 05 シート + 行1ヘッダー + A2,B2 + C2:G2 計算式
 *   2. xchangeStep02_SetMonthlyCheckStatus() ← 05 の H2:J2 計算式
 *   3. xchangeStep03_SetYearEndBase()        ← 06 シート + 行1ヘッダー + A2,B2 + C2:F2 計算式
 *   4. xchangeStep04_SetYearEndCheckStatus() ← 06 の G2:H2 計算式
 *
 * 【既存機能を壊さないこと】
 *   - 既存 コード.gs / doPost / addSale / addExpense / addPurchase は無変更
 *   - 01_売上明細 / 02_経費明細 / 03_仕入明細 のデータは触らない
 *   - Apps Script ウェブアプリ URL は変更不要
 *
 * 【データシートの列前提 (v3.18.6 で更新)】
 *   01_売上明細  C=売上日 / D=店舗名 / M=合計金額 / S=確認ステータス
 *   02_経費明細  C=経費日 / D=店舗名 / H=金額税込 / P=確認ステータス
 *   03_仕入明細  C=仕入日 / D=店舗名 / K=仕入合計 / Q=確認ステータス
 * ===================================================================== */

// シート名 (既存と一致する前提)
var XC_SHEET_SALES     = "01_売上明細";
var XC_SHEET_EXPENSES  = "02_経費明細";
var XC_SHEET_PURCHASES = "03_仕入明細";
var XC_SHEET_MONTHLY   = "05_月次集計";
var XC_SHEET_YEAREND   = "06_決算用集計";

// 列位置 (上記コメント参照)
var XC_SALES_DATE = "C", XC_SALES_STORE = "D", XC_SALES_TOTAL  = "M", XC_SALES_STATUS = "S";
var XC_EXP_DATE   = "C", XC_EXP_STORE   = "D", XC_EXP_AMOUNT   = "H", XC_EXP_STATUS   = "P";
var XC_PUR_DATE   = "C", XC_PUR_STORE   = "D", XC_PUR_TOTAL    = "K", XC_PUR_STATUS   = "Q";

var XC_DEFAULT_STORE = "吉田自動車工業 X-Change本店";

// 月初・月末の式片 (A2 が "yyyy/mm" 文字列前提)
function _xcMonthStart_(cell) {
  return 'TEXT(DATE(VALUE(LEFT(' + cell + ',4)),VALUE(MID(' + cell + ',6,2)),1),"yyyy-mm-dd")';
}
function _xcMonthEnd_(cell) {
  return 'TEXT(EOMONTH(DATE(VALUE(LEFT(' + cell + ',4)),VALUE(MID(' + cell + ',6,2)),1),0),"yyyy-mm-dd")';
}

// シート取得 (なければ作成)
function _xcGetOrCreate_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

// ====================================================================
// Step 1: 05_月次集計 の基本部分 (ヘッダー + A2,B2 + C2〜G2)
// ====================================================================
function xchangeStep01_SetMonthlyBase() {
  var sh = _xcGetOrCreate_(XC_SHEET_MONTHLY);

  // 1行目ヘッダー (11列)
  var headers = ["対象年月","店舗名","売上合計","売上件数","経費合計","仕入合計","粗利益","未確認件数","修正依頼件数","月次締めステータス","備考"];
  sh.getRange(1, 1, 1, 11).setValues([headers]);

  // A2 / B2
  sh.getRange(2, 1, 1, 2).setValues([["2026/05", XC_DEFAULT_STORE]]);

  // C2:G2 計算式 (5列を1回の setFormulas で書込み)
  var mS = _xcMonthStart_("$A2");
  var mE = _xcMonthEnd_("$A2");
  var SS = XC_SHEET_SALES, SE = XC_SHEET_EXPENSES, SP = XC_SHEET_PURCHASES;

  var fC = "=IFERROR(SUMIFS('" + SS + "'!" + XC_SALES_TOTAL + ":" + XC_SALES_TOTAL +
           ",'" + SS + "'!" + XC_SALES_DATE + ":" + XC_SALES_DATE + ',">="&' + mS +
           ",'" + SS + "'!" + XC_SALES_DATE + ":" + XC_SALES_DATE + ',"<="&' + mE +
           ",'" + SS + "'!" + XC_SALES_STORE + ":" + XC_SALES_STORE + ",$B2),0)";

  var fD = "=IFERROR(COUNTIFS('" + SS + "'!" + XC_SALES_DATE + ":" + XC_SALES_DATE + ',">="&' + mS +
           ",'" + SS + "'!" + XC_SALES_DATE + ":" + XC_SALES_DATE + ',"<="&' + mE +
           ",'" + SS + "'!" + XC_SALES_STORE + ":" + XC_SALES_STORE + ",$B2),0)";

  var fE = "=IFERROR(SUMIFS('" + SE + "'!" + XC_EXP_AMOUNT + ":" + XC_EXP_AMOUNT +
           ",'" + SE + "'!" + XC_EXP_DATE + ":" + XC_EXP_DATE + ',">="&' + mS +
           ",'" + SE + "'!" + XC_EXP_DATE + ":" + XC_EXP_DATE + ',"<="&' + mE +
           ",'" + SE + "'!" + XC_EXP_STORE + ":" + XC_EXP_STORE + ",$B2),0)";

  // v3.18.10: 仕入合計は店舗名条件を一旦外し、対象月だけで集計 (案B)。
  //   理由: 03_仕入明細 の店舗名 (例 "吉田自動車工業") が 05 B2 の
  //   "吉田自動車工業 X-Change本店" と完全一致せず 0 になっていたため。
  //   ※店舗名を厳密一致させたい場合は下記末尾に
  //     +",'"+SP+"'!"+XC_PUR_STORE+":"+XC_PUR_STORE+",$B2" を戻す。
  var fF = "=IFERROR(SUMIFS('" + SP + "'!" + XC_PUR_TOTAL + ":" + XC_PUR_TOTAL +
           ",'" + SP + "'!" + XC_PUR_DATE + ":" + XC_PUR_DATE + ',">="&' + mS +
           ",'" + SP + "'!" + XC_PUR_DATE + ":" + XC_PUR_DATE + ',"<="&' + mE +
           "),0)";

  var fG = "=C2-E2-F2"; // 粗利益

  sh.getRange(2, 3, 1, 5).setFormulas([[fC, fD, fE, fF, fG]]);

  console.log("[xchangeStep01_SetMonthlyBase] 完了: 05_月次集計 ヘッダー + A2:B2 + C2:G2 設定");
}

// ====================================================================
// Step 2: 05_月次集計 の確認ステータス部分 (H2:J2)
// ====================================================================
function xchangeStep02_SetMonthlyCheckStatus() {
  var sh = _xcGetOrCreate_(XC_SHEET_MONTHLY);

  var mS = _xcMonthStart_("$A2");
  var mE = _xcMonthEnd_("$A2");
  var SS = XC_SHEET_SALES, SE = XC_SHEET_EXPENSES, SP = XC_SHEET_PURCHASES;

  // 1 type × 1 status の COUNTIFS 式片
  function cnt(sht, dateCol, storeCol, statusCol, statusVal) {
    return "COUNTIFS('" + sht + "'!" + dateCol + ":" + dateCol + ',">="&' + mS +
           ",'" + sht + "'!" + dateCol + ":" + dateCol + ',"<="&' + mE +
           ",'" + sht + "'!" + storeCol + ":" + storeCol + ",$B2" +
           ",'" + sht + "'!" + statusCol + ":" + statusCol + ',"' + statusVal + '")';
  }

  // H2: 未確認件数 (売上+経費+仕入 の "未確認")
  var fH = "=IFERROR(" +
    cnt(SS, XC_SALES_DATE, XC_SALES_STORE, XC_SALES_STATUS, "未確認") + "+" +
    cnt(SE, XC_EXP_DATE,   XC_EXP_STORE,   XC_EXP_STATUS,   "未確認") + "+" +
    cnt(SP, XC_PUR_DATE,   XC_PUR_STORE,   XC_PUR_STATUS,   "未確認") + ",0)";

  // I2: 修正依頼件数 (修正依頼 + 差戻し × 3 type)
  var fI = "=IFERROR(" +
    cnt(SS, XC_SALES_DATE, XC_SALES_STORE, XC_SALES_STATUS, "修正依頼") + "+" +
    cnt(SS, XC_SALES_DATE, XC_SALES_STORE, XC_SALES_STATUS, "差戻し")   + "+" +
    cnt(SE, XC_EXP_DATE,   XC_EXP_STORE,   XC_EXP_STATUS,   "修正依頼") + "+" +
    cnt(SE, XC_EXP_DATE,   XC_EXP_STORE,   XC_EXP_STATUS,   "差戻し")   + "+" +
    cnt(SP, XC_PUR_DATE,   XC_PUR_STORE,   XC_PUR_STATUS,   "修正依頼") + "+" +
    cnt(SP, XC_PUR_DATE,   XC_PUR_STORE,   XC_PUR_STATUS,   "差戻し")   + ",0)";

  // J2: 月次締めステータス
  var fJ = '=IF((H2+I2)>0,"未完了","締め可能")';

  sh.getRange(2, 8, 1, 3).setFormulas([[fH, fI, fJ]]);

  console.log("[xchangeStep02_SetMonthlyCheckStatus] 完了: 05_月次集計 H2:J2 設定");
}

// ====================================================================
// Step 3: 06_決算用集計 の基本部分 (ヘッダー + A2,B2 + C2〜F2)
// ====================================================================
function xchangeStep03_SetYearEndBase() {
  var sh = _xcGetOrCreate_(XC_SHEET_YEAREND);

  // 1行目ヘッダー (9列)
  var headers = ["対象年","店舗名","年間売上合計","年間経費合計","年間仕入合計","年間粗利益","未確認件数","決算確認ステータス","備考"];
  sh.getRange(1, 1, 1, 9).setValues([headers]);

  // A2 / B2
  sh.getRange(2, 1, 1, 2).setValues([["2026", XC_DEFAULT_STORE]]);

  // 年初・年末 ($A2 が "2026" 文字列または数値前提)
  var yS = '($A2&"-01-01")';
  var yE = '($A2&"-12-31")';
  var SS = XC_SHEET_SALES, SE = XC_SHEET_EXPENSES, SP = XC_SHEET_PURCHASES;

  var fC = "=IFERROR(SUMIFS('" + SS + "'!" + XC_SALES_TOTAL + ":" + XC_SALES_TOTAL +
           ",'" + SS + "'!" + XC_SALES_DATE + ":" + XC_SALES_DATE + ',">="&' + yS +
           ",'" + SS + "'!" + XC_SALES_DATE + ":" + XC_SALES_DATE + ',"<="&' + yE +
           ",'" + SS + "'!" + XC_SALES_STORE + ":" + XC_SALES_STORE + ",$B2),0)";

  var fD = "=IFERROR(SUMIFS('" + SE + "'!" + XC_EXP_AMOUNT + ":" + XC_EXP_AMOUNT +
           ",'" + SE + "'!" + XC_EXP_DATE + ":" + XC_EXP_DATE + ',">="&' + yS +
           ",'" + SE + "'!" + XC_EXP_DATE + ":" + XC_EXP_DATE + ',"<="&' + yE +
           ",'" + SE + "'!" + XC_EXP_STORE + ":" + XC_EXP_STORE + ",$B2),0)";

  // v3.18.10: 年間仕入合計も店舗名条件を一旦外し、対象年だけで集計 (案B)。
  //   理由: 03_仕入明細 の店舗名が 06 B2 と完全一致せず 0 になっていたため。
  //   ※店舗名を厳密一致させたい場合は下記末尾に
  //     +",'"+SP+"'!"+XC_PUR_STORE+":"+XC_PUR_STORE+",$B2" を戻す。
  var fE = "=IFERROR(SUMIFS('" + SP + "'!" + XC_PUR_TOTAL + ":" + XC_PUR_TOTAL +
           ",'" + SP + "'!" + XC_PUR_DATE + ":" + XC_PUR_DATE + ',">="&' + yS +
           ",'" + SP + "'!" + XC_PUR_DATE + ":" + XC_PUR_DATE + ',"<="&' + yE +
           "),0)";

  var fF = "=C2-D2-E2"; // 年間粗利益

  sh.getRange(2, 3, 1, 4).setFormulas([[fC, fD, fE, fF]]);

  console.log("[xchangeStep03_SetYearEndBase] 完了: 06_決算用集計 ヘッダー + A2:B2 + C2:F2 設定");
}

// ====================================================================
// Step 4: 06_決算用集計 の確認ステータス部分 (G2:H2)
// ====================================================================
function xchangeStep04_SetYearEndCheckStatus() {
  var sh = _xcGetOrCreate_(XC_SHEET_YEAREND);

  var yS = '($A2&"-01-01")';
  var yE = '($A2&"-12-31")';
  var SS = XC_SHEET_SALES, SE = XC_SHEET_EXPENSES, SP = XC_SHEET_PURCHASES;

  function cnt(sht, dateCol, storeCol, statusCol, statusVal) {
    return "COUNTIFS('" + sht + "'!" + dateCol + ":" + dateCol + ',">="&' + yS +
           ",'" + sht + "'!" + dateCol + ":" + dateCol + ',"<="&' + yE +
           ",'" + sht + "'!" + storeCol + ":" + storeCol + ",$B2" +
           ",'" + sht + "'!" + statusCol + ":" + statusCol + ',"' + statusVal + '")';
  }

  // G2: 未確認件数 (未確認+修正依頼+差戻し+保留 × 3 type = 12項合計)
  var statuses = ["未確認", "修正依頼", "差戻し", "保留"];
  var parts = [];
  for (var i = 0; i < statuses.length; i++) {
    var st = statuses[i];
    parts.push(cnt(SS, XC_SALES_DATE, XC_SALES_STORE, XC_SALES_STATUS, st));
    parts.push(cnt(SE, XC_EXP_DATE,   XC_EXP_STORE,   XC_EXP_STATUS,   st));
    parts.push(cnt(SP, XC_PUR_DATE,   XC_PUR_STORE,   XC_PUR_STATUS,   st));
  }
  var fG = "=IFERROR(" + parts.join("+") + ",0)";

  // H2: 決算確認ステータス
  var fH = '=IF(G2>0,"確認未完了","確認可能")';

  sh.getRange(2, 7, 1, 2).setFormulas([[fG, fH]]);

  console.log("[xchangeStep04_SetYearEndCheckStatus] 完了: 06_決算用集計 G2:H2 設定");
}

// ====================================================================
// 確認専用: スプレッドシート状態チェック (READ-ONLY)
// ====================================================================
// 手作業確認を減らすための軽量な状態チェック。書き換えは一切行いません。
//
// 実行内容:
//   1. 必須シート 11 種の存在確認
//   2. 01/02/03 の明細データ件数 (getLastRow のみ・全行走査なし)
//   3. 05_月次集計 の A2:J2 主要セル
//   4. 06_決算用集計 の A2:H2 主要セル
//   5. 総合判定サマリー
//
// API 呼出: 約 5 回 (3 getLastRow + 2 getValues + sheet 取得)
// 想定実行時間: 1〜2 秒
function xchangeCheckSpreadsheetStatus() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // ----- 1. 必須シートの存在確認 -----
  var requiredSheets = [
    "01_売上明細","02_経費明細","03_仕入明細","04_営業日管理",
    "05_月次集計","06_決算用集計",
    "07_店舗マスタ","08_商品マスタ","09_経費科目マスタ",
    "10_支払方法マスタ","11_本社確認管理","12_操作ログ"
  ];
  console.log("===== 1. 必須シート存在確認 =====");
  var allSheetsOK = true;
  var missingSheets = []; // v3.18.11: NG シート名をサマリー表示用に収集
  for (var i = 0; i < requiredSheets.length; i++) {
    var name = requiredSheets[i];
    var exists = !!ss.getSheetByName(name);
    console.log("  " + name + ": " + (exists ? "OK" : "NG"));
    if (!exists) { allSheetsOK = false; missingSheets.push(name); }
  }

  // ----- 2. 明細データ件数 (getLastRow のみ・全行走査しない) -----
  console.log("");
  console.log("===== 2. 明細データ件数 =====");
  function dataCount(name) {
    var sh = ss.getSheetByName(name);
    if (!sh) return -1;
    var last = sh.getLastRow();
    return Math.max(0, last - 1); // ヘッダー行を除外
  }
  var salesCount    = dataCount("01_売上明細");
  var expenseCount  = dataCount("02_経費明細");
  var purchaseCount = dataCount("03_仕入明細");
  console.log("  01_売上明細: " + (salesCount    < 0 ? "シートなし" : salesCount    + " 件"));
  console.log("  02_経費明細: " + (expenseCount  < 0 ? "シートなし" : expenseCount  + " 件"));
  console.log("  03_仕入明細: " + (purchaseCount < 0 ? "シートなし" : purchaseCount + " 件"));

  // ----- 3. 05_月次集計 の主要セル (A2:J2 を 1 回の getValues で取得) -----
  console.log("");
  console.log("===== 3. 05_月次集計 主要セル =====");
  var monSh = ss.getSheetByName("05_月次集計");
  var monthlyOK = false;
  if (monSh) {
    var monRow = monSh.getRange(2, 1, 1, 10).getValues()[0];
    var monLabels = [
      "A2 対象年月","B2 店舗名","C2 売上合計","D2 売上件数","E2 経費合計",
      "F2 仕入合計","G2 粗利益","H2 未確認件数","I2 修正依頼件数","J2 月次締めステータス"
    ];
    for (var j = 0; j < monLabels.length; j++) {
      console.log("  " + monLabels[j] + ": " + monRow[j]);
    }
    // 判定: A2,B2,C2,G2,J2 がすべて非空
    monthlyOK = (monRow[0] !== "" && monRow[1] !== "" && monRow[2] !== "" && monRow[6] !== "" && monRow[9] !== "");
  } else {
    console.log("  05_月次集計 シートが存在しません");
  }

  // ----- 4. 06_決算用集計 の主要セル (A2:H2 を 1 回の getValues で取得) -----
  console.log("");
  console.log("===== 4. 06_決算用集計 主要セル =====");
  var yeSh = ss.getSheetByName("06_決算用集計");
  var yearEndOK = false;
  if (yeSh) {
    var yeRow = yeSh.getRange(2, 1, 1, 8).getValues()[0];
    var yeLabels = [
      "A2 対象年","B2 店舗名","C2 年間売上合計","D2 年間経費合計",
      "E2 年間仕入合計","F2 年間粗利益","G2 未確認件数","H2 決算確認ステータス"
    ];
    for (var k = 0; k < yeLabels.length; k++) {
      console.log("  " + yeLabels[k] + ": " + yeRow[k]);
    }
    // 判定: A2,B2,C2,F2,H2 がすべて非空
    yearEndOK = (yeRow[0] !== "" && yeRow[1] !== "" && yeRow[2] !== "" && yeRow[5] !== "" && yeRow[7] !== "");
  } else {
    console.log("  06_決算用集計 シートが存在しません");
  }

  // ----- 5. 総合判定サマリー -----
  var overallOK = allSheetsOK && monthlyOK && yearEndOK;
  console.log("");
  console.log("===== X-Change Spreadsheet Status =====");
  console.log("必須シート：" + (allSheetsOK ? "OK" : "NG"));
  if (!allSheetsOK) {
    console.log("不足シート：" + missingSheets.join(", "));
  }
  console.log("売上データ：" + (salesCount    < 0 ? "シートなし" : salesCount    + "件"));
  console.log("経費データ：" + (expenseCount  < 0 ? "シートなし" : expenseCount  + "件"));
  console.log("仕入データ：" + (purchaseCount < 0 ? "シートなし" : purchaseCount + "件"));
  console.log("月次集計：" + (monthlyOK ? "OK" : "要確認"));
  console.log("決算用集計：" + (yearEndOK ? "OK" : "要確認"));
  console.log("総合判定：" + (overallOK ? "OK" : "要確認"));
  console.log("======================================");
}
