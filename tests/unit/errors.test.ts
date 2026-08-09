import { describe, expect, it } from "vitest";
import {
  cartMutationFailurePayload,
  OvsCartMutationError,
} from "../../src/errors.js";

const target = {
  operation: "add" as const,
  product_id: "7",
  product_attribute_id: "3",
  product_customization_id: "0",
};

describe("structured cart mutation failures", () => {
  it("keeps applied_units null when reconciliation cannot prove a count", () => {
    const payload = cartMutationFailurePayload(
      new OvsCartMutationError(target, 2, null, "synthetic reread failure"),
    );
    expect(payload).toMatchObject({
      code: "OVS_CART_MUTATION_AMBIGUOUS",
      cart_may_be_partially_modified: true,
      applied_units: null,
      requested_units: 2,
      target,
    });
  });

  it("publishes only the number of units independently proven", () => {
    const payload = cartMutationFailurePayload(
      new OvsCartMutationError(target, 3, 1, "synthetic second write failure"),
    );
    expect(payload).toMatchObject({
      code: "OVS_CART_MUTATION_PARTIAL",
      applied_units: 1,
      requested_units: 3,
    });
  });
});
