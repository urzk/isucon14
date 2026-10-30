import { ErroredUpstream } from "./common.js";
import { setTimeout } from "node:timers/promises";

type PaymentGatewayPostPaymentRequest = {
  amount: number;
};

const MAX_PAYMENT_RETRY = 30;

// 決済マイクロサービスは負荷に応じてランダムに失敗するため、
// ライドIDを Idempotency-Key にして成功 (204) するまでリトライする
export const requestPaymentGatewayPostPayment = async (
  paymentGatewayURL: string,
  token: string,
  param: PaymentGatewayPostPaymentRequest,
  idempotencyKey: string,
): Promise<ErroredUpstream | Error | undefined> => {
  let lastError = "";
  for (let retry = 0; retry < MAX_PAYMENT_RETRY; retry++) {
    try {
      const res = await fetch(`${paymentGatewayURL}/payments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(param),
      });
      if (res.status === 204) {
        return undefined;
      }
      if (res.status === 400 || res.status === 422) {
        return new Error(
          `[POST /payments] unexpected status code (${res.status}): ${await res.text()}`,
        );
      }
      // 409 (同じキーのリクエストが処理中) や 5xx はリトライする
      lastError = `status ${res.status}`;
      await res.body?.cancel();
    } catch (err) {
      lastError = `${err}`;
    }
    await setTimeout(50);
  }
  return new ErroredUpstream(`payment failed after retries: ${lastError}`);
};
