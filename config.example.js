/* ============================================================
 * X-Change Sheets 連携 設定サンプル (公開リポジトリに含まれます)
 * ------------------------------------------------------------
 * このファイルは「設定の書き方」を示すための例です。実際の値は入っていません。
 *
 * 【使い方】
 * 1. このファイルを同じディレクトリに `config.local.js` という名前でコピーする。
 *    cp config.example.js config.local.js
 *
 * 2. `config.local.js` の <YOUR_APPS_SCRIPT_URL> と <YOUR_TOKEN> を、自分の
 *    Google Apps Script Web App URL / token に書き換える。
 *
 * 3. `config.local.js` は `.gitignore` で除外されており、GitHub にはアップロード
 *    されません。本物の URL / token は手元の端末だけに残ります。
 *
 * 【動作】
 * - `index.html` は `app.js` の直前で `<script src="config.local.js"></script>`
 *   を読み込みます (ファイルが存在しなくても 404 になるだけで他に害はありません)。
 * - `config.local.js` があれば `window.XCHANGE_LOCAL_CONFIG` を定義し、
 *   `app.js` 側で `XCHANGE_SHEETS_CONFIG` (endpoint / token / enabled) を上書きします。
 * - `config.local.js` が無い、または値が空の場合は `_postToSheets` が no-op に
 *   なり、ローカル保存 (localStorage) と画面表示のみで動作します。
 *   売上・経費・仕入の登録フローと、月次集計・決算用集計の Apps Script 関数
 *   (xchangeStep01〜04 / xchangeCheckSpreadsheetStatus) には影響しません。
 *
 * 【GitHub Pages でスマホ確認する場合】
 * - 公開リポジトリに本物の endpoint / token を入れないでください。
 * - スマホ実機テストで Sheets 送信まで動かしたい場合は、`config.local.js` を
 *   `.gitignore` に入れたまま、ホスティング側 (社内サーバ等) に手動で配置する
 *   方式を推奨します。GitHub Pages からのテストでは Sheets 送信は無効のまま、
 *   カメラ・OCR・ローカル保存・画面遷移の確認に絞ることができます。
 * ============================================================ */

window.XCHANGE_LOCAL_CONFIG = {
  // Apps Script ウェブアプリ URL (デプロイの「ウェブアプリ」公開 URL)
  //   例: https://script.google.com/macros/s/AKfycb******************************/exec
  endpoint: '<YOUR_APPS_SCRIPT_URL>',

  // Apps Script 側 doPost(e) の token 照合に使う共有秘密 (任意の文字列)
  token: '<YOUR_TOKEN>',

  // false にすると Sheets 送信を完全に無効化 (ローカル保存のみで動作)
  enabled: true
};
