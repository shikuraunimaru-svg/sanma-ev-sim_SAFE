export default function About() {
  return (
    <div className="max-w-3xl mx-auto p-6 bg-white dark:bg-gray-800 leading-relaxed rounded-lg shadow-sm border border-gray-100 dark:border-gray-700">
      <h1 className="text-3xl font-bold mb-4">このサイトについて</h1>

      <p className="mb-3">
        三人麻雀（サンマ）における打牌選択を、期待値ベースで比較するシミュレーターです。
        どの牌を切ると有利かを、和了率や打点などの観点から数値で確認できます。
      </p>

      <p className="mb-3">本ツールでは、以下の指標を算出しています。</p>
      <ul className="list-disc pl-5 mb-4">
        <li>期待値（EV）</li>
        <li>和了確率</li>
        <li>和了時平均打点</li>
        <li>聴牌確率</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2">使い方</h2>
      <ul className="list-disc pl-5 mb-4">
        <li>牌画像をクリックして手牌とドラ表示牌を入力</li>
        <li>巡目と北の抜き枚数を設定</li>
        <li>「解析開始」をクリック</li>
      </ul>

      <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
        ※計算時間はユーザーの端末性能に依存します。
      </p>

      <p className="mb-4">
        ご要望・ご質問・不具合報告などは以下までお願いします。<br />
        X: <a href="https://x.com/shikuraunimaru" className="text-blue-600 dark:text-blue-400 hover:underline">https://x.com/shikuraunimaru</a>
      </p>

      <h2 className="text-xl font-semibold mt-6 mb-2">ルール</h2>
      <p className="mb-2">以下のサンマルールを前提としています。</p>
      <ul className="list-disc pl-5 mb-4">
        <li>雀魂、天鳳、麻雀一番街準拠</li>
        <li>ツモ損あり</li>
        <li>北は抜きドラ</li>
        <li>赤ドラは各1枚（5p・5s）</li>
        <li>王牌14枚残し</li>
        <li>華牌なし</li>
      </ul>

      <h2 className="text-xl font-semibold mt-6 mb-2">仕様</h2>
      <ul className="list-disc pl-5 mb-4">
        <li>
          他家の存在を考慮しない「一人麻雀」前提のシミュレーションです
          （副露判断・ロン和了は考慮していません）
        </li>
        <li>巡目を考慮した手組みで進行します</li>
　　　　<li>流局時のテンパイ/ノーテンを考慮します</li>
        <li>シャンテン戻し、テンパイ外しを考慮します</li>
　　　　<li>赤ドラ、裏ドラを考慮します</li>
        <li>北抜き（リーチ後含む）を考慮します</li>
        <li>暗槓からのリーチを考慮します</li>
　　　　<li>ピンズ・ソーズの加槓を考慮します</li>
　　　　<li>マンズ・字牌は常に即加槓します</li>
      </ul>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        ※本ツールはモンテカルロシミュレーションに基づくため、結果にはブレがあります。<br />
        ※特に2シャンテン以上の手牌は精度が低下するため、参考程度にご利用ください。
      </p>
    </div>
  )
}