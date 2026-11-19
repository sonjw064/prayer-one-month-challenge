import type { Metadata } from "next";
import { CopyAccountButton } from "../../components/offering/CopyAccountButton";
import { getOfferingConfig } from "../../src/features/offering/accounts";

export const metadata: Metadata = {
  title: "헌금 안내",
  description: "삼덕청년부 헌금 계좌 안내입니다. 계좌번호를 복사해 은행 앱에서 이체할 수 있습니다.",
};

// The accounts come from an environment variable: read it on every request, never at build time.
export const dynamic = "force-dynamic";

export default function OfferingPage() {
  const config = getOfferingConfig();

  return (
    <div className="shell offering">
      <p className="eyebrow off-eyebrow">SAMDEOK CHURCH</p>
      <h1 className="off-title">마음을 담는 헌금</h1>
      <p className="off-lead">
        헌금 종류에 맞는 계좌를 확인해 주세요.
        <br />
        계좌번호를 복사해 은행 앱에서 이체하실 수 있습니다.
      </p>

      {config.status === "ready" ? (
        <>
          <ul className="off-list">
            {config.accounts.map((account) => (
              <li className="off-card" key={account.number}>
                <h2>{account.title}</h2>
                <p className="off-bank">{account.bank}</p>
                <p className="off-number">{account.number}</p>
                <p className="off-holder">예금주 · {account.holder}</p>
                <CopyAccountButton number={account.number} label={account.title} />
              </li>
            ))}
          </ul>

          <aside className="off-notice" aria-label="이체 전 안내">
            <h2>이체 전 확인해 주세요</h2>
            <p>
              헌금 종류와 계좌번호, 예금주를 확인한 후 이체해 주세요. 복사 버튼은 계좌번호만 복사하며, 이체는 이용하시는 은행 앱에서 진행합니다.
            </p>
          </aside>
        </>
      ) : (
        <section className="off-card" role="status">
          <h2>헌금 계좌 안내를 준비 중입니다</h2>
          <p className="helper-text">잠시 후 다시 확인해 주세요. 문의는 교회 운영 담당자에게 해 주세요.</p>
        </section>
      )}

      <p className="off-footer">삼덕교회 · 헌금 계좌 안내</p>
    </div>
  );
}
