import { describe, it, expect } from "vitest";
import {
  isPaymentGatewaySource,
  shouldSkipSessionForJourney,
  filterMarketingTouchpoints,
  isNonMarketingChannelSource,
} from "@/lib/pixel/source-classification";

describe("source-classification", () => {
  describe("isPaymentGatewaySource", () => {
    it("blocks canonical gateway strings", () => {
      expect(isPaymentGatewaySource("gocuotas")).toBe(true);
      expect(isPaymentGatewaySource("GoCuotas")).toBe(true);
      expect(isPaymentGatewaySource("mercadopago")).toBe(true);
      expect(isPaymentGatewaySource("mercadopago_checkout")).toBe(true);
      expect(isPaymentGatewaySource("paypal")).toBe(true);
      expect(isPaymentGatewaySource("vtexpayments")).toBe(true);
    });

    it("blocks prefix and contains rules", () => {
      expect(isPaymentGatewaySource("mercadopago_ar")).toBe(true);
      expect(isPaymentGatewaySource("shop_gocuotas_return")).toBe(true);
      expect(isPaymentGatewaySource("vtexpay")).toBe(true);
    });

    it("allows marketing sources", () => {
      expect(isPaymentGatewaySource("meta")).toBe(false);
      expect(isPaymentGatewaySource("google")).toBe(false);
      expect(isPaymentGatewaySource("direct")).toBe(false);
    });
  });

  describe("shouldSkipSessionForJourney", () => {
    it("blocks utm_source=gocuotas even on checkout return with fresh signal", () => {
      expect(
        shouldSkipSessionForJourney({
          source: "gocuotas",
          medium: "referral",
          pageUrl: "https://store.com/checkout/orderPlaced?gatewayCallback=1",
          hasFreshMarketingSignal: true,
        })
      ).toBe(true);
    });

    it("skips checkout return without marketing signals", () => {
      expect(
        shouldSkipSessionForJourney({
          source: "direct",
          pageUrl: "https://store.com/checkout/orderPlaced",
        })
      ).toBe(true);

      expect(
        shouldSkipSessionForJourney({
          source: "direct",
          pageUrl: "https://store.com/foo?gatewayCallback=1",
        })
      ).toBe(true);
    });

    it("keeps checkout session with fresh paid click", () => {
      expect(
        shouldSkipSessionForJourney({
          source: "google",
          medium: "cpc",
          pageUrl: "https://store.com/checkout/",
          clickId: "gclid-abc",
          hasFreshMarketingSignal: true,
        })
      ).toBe(false);
    });

    it("keeps normal marketing sessions", () => {
      expect(
        shouldSkipSessionForJourney({
          source: "meta",
          medium: "cpc",
          pageUrl: "https://store.com/producto/zapatillas",
          campaign: "spring-sale",
          hasFreshMarketingSignal: true,
        })
      ).toBe(false);
    });
  });

  describe("filterMarketingTouchpoints", () => {
    it("removes gateway touchpoints from stored JSON", () => {
      const touchpoints = [
        { source: "meta", medium: "cpc", page: "/producto" },
        { source: "gocuotas", medium: "referral", page: "/checkout/orderPlaced" },
        { source: "google", medium: "cpc", page: "/landing" },
      ];
      expect(filterMarketingTouchpoints(touchpoints)).toEqual([
        { source: "meta", medium: "cpc", page: "/producto" },
        { source: "google", medium: "cpc", page: "/landing" },
      ]);
    });

    it("drops checkout-only direct when other touchpoints exist", () => {
      const touchpoints = [
        { source: "meta", medium: "cpc" },
        { source: "direct", medium: undefined, page: "/checkout/cart" },
      ];
      expect(filterMarketingTouchpoints(touchpoints)).toEqual([
        { source: "meta", medium: "cpc" },
      ]);
    });
  });

  describe("isNonMarketingChannelSource", () => {
    it("matches isPaymentGatewaySource for API filters", () => {
      expect(isNonMarketingChannelSource("mobbex")).toBe(true);
      expect(isNonMarketingChannelSource("instagram")).toBe(false);
    });
  });
});
