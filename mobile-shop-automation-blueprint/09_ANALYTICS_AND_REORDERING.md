# Analytics and Reorder Recommendation Specification

## 1. Objective

Recommend what to buy next without creating a black box.

The engine must answer:

- which product/variant should be purchased
- suggested quantity
- estimated investment
- expected sales period
- expected gross profit
- confidence
- reasons
- risks
- suggested supplier
- effect on remaining cash budget

## 2. Required metrics

### Sales metrics
- units sold: 7, 30, 90 days
- net revenue
- average selling price
- actual COGS
- gross profit
- gross margin
- discount rate
- sales trend

### Demand metrics
- qualified inquiries
- unavailable requests
- quotations
- reservations
- lost-sale reasons
- demand-to-sale conversion
- requested budget
- requested variant attributes
- recency

### Inventory metrics
- available
- reserved
- inbound
- stockout days
- average inventory
- days of cover
- days in stock
- aged quantity/value
- sell-through
- inventory turnover

### Risk metrics
- return rate
- defect/warranty rate
- price volatility
- supplier delay
- supplier cancellation
- concentration by brand
- capital requirement
- low data confidence

## 3. Core formulas

### Gross profit

```text
gross_profit = net_sales_revenue - COGS
gross_margin_percent = gross_profit / net_sales_revenue * 100
```

### Sell-through

```text
sell_through = units_sold / (opening_units + units_received) * 100
```

### Average daily sales

Use recency weighting:

```text
ADS =
  0.50 * units_sold_last_30 / 30
+ 0.30 * units_sold_previous_30 / 30
+ 0.20 * units_sold_previous_30 / 30
```

For low-volume premium devices, also show an event-based estimate and low confidence.

### Qualified unmet demand

```text
qualified_unmet_units =
  unavailable_requests
* request_quality_weight
* estimated_conversion_probability
* recency_weight
```

Example conversion weights by outcome:

- explicit ready-to-buy stockout: 1.00
- requested quotation and follow-up: 0.70
- price too high: 0.25
- casual inquiry: 0.15
- duplicate same-customer request: 0.00-0.25 incremental
- invalid/fraudulent: 0.00

Weights must be configurable and evaluated against actual conversions.

### Forecast daily demand

```text
forecast_daily_demand =
  sales_component
+ qualified_unmet_units / forecast_window_days
```

### Safety stock

```text
safety_stock =
  service_factor
* demand_variability
* sqrt(lead_time_days)
```

For the first version, a simpler rule is acceptable:

```text
safety_stock = forecast_daily_demand * safety_days
```

### Reorder point

```text
reorder_point =
  forecast_daily_demand * supplier_lead_time_days
+ safety_stock
```

### Target stock

```text
target_stock =
  forecast_daily_demand
* (lead_time_days + review_period_days)
+ safety_stock
```

### Recommended quantity

```text
raw_recommended_quantity =
  max(
    0,
    target_stock
    - available
    - inbound
    + reserved
  )
```

Apply:

- case-pack rounding
- minimum supplier quantity
- maximum stock-days cap
- capital budget cap
- brand/price concentration cap
- aging-stock penalty
- defect/return penalty

## 4. Priority score

Suggested v1 score from 0-100:

```text
30% sales velocity
25% qualified unmet demand
15% expected gross profit
10% stockout severity
10% recency/trend
5% supplier reliability
5% strategic/accessory attachment value

minus penalties:
- aging/capital lock
- return/defect rate
- price volatility
- low confidence
```

Do not use national brand market share as a direct purchase weight. It may act only as a small prior when shop data is insufficient.

## 5. Budget allocation

When total recommended cost exceeds available budget:

1. Exclude blocked/risky products.
2. Reserve a configurable liquidity buffer.
3. Rank by expected gross profit per invested rupee, adjusted for confidence and time to sale.
4. Apply diversification limits.
5. Allocate to minimum viable quantities.
6. Recalculate remaining budget.
7. Stop when no valid recommendation fits.

Useful metric:

```text
expected_return_on_inventory =
  expected_gross_profit / recommended_investment
```

Also show expected time to sell. A high percentage return over a very long period may be worse than a smaller but faster return.

## 6. Confidence score

Confidence increases with:

- more sales observations
- consistent demand
- reliable lead time
- stable cost/price
- recent data
- low forecast error

Confidence decreases with:

- new/unseen product
- sparse data
- launch hype only
- high price volatility
- inconsistent aliases
- unusual one-time bulk sale
- unreliable supplier

Labels:

- High: 75-100
- Medium: 50-74
- Low: below 50

Low confidence never means "do nothing"; it means use a test quantity or source on demand.

## 7. Recommendation reasons

Every recommendation should contain structured reasons, for example:

- "Sold 8 units in the last 30 days."
- "Recorded 5 qualified requests while out of stock."
- "Current stock covers approximately 3 days."
- "Supplier normally delivers in 5 days."
- "Expected gross margin is 11.8%."
- "Return rate is below category average."
- "Quantity capped at 3 because this is a premium, low-confidence variant."

## 8. Risk examples

- unit cost increased 9% in 14 days
- current stock older than 60 days in same family
- three customer returns in last 20 sales
- supplier on-time rate below 70%
- recommended investment exceeds product cap
- demand comes from one customer only
- color preference is uncertain
- price objection rate is high

## 9. Evaluation

Track each recommendation after owner decision:

- accepted quantity
- actual purchase quantity
- received date
- sell-through after 7/30/60 days
- realized gross profit
- days to sell
- stockout avoided
- aged stock created
- forecast error
- owner override reason

Metrics:

```text
forecast_error = abs(forecast_units - actual_units) / max(actual_units, 1)
recommendation_precision = profitable_accepted_recommendations / accepted_recommendations
```

Use evaluation to adjust weights. Do not change formulas without versioning.

## 10. AI explanation layer

An LLM may:

- summarize recommendation reasons
- answer owner questions using authorized metrics
- produce an Urdu/English daily summary
- compare scenarios
- highlight unusual patterns

An LLM may not:

- invent missing transactions
- change stock
- finalize purchases
- claim statutory profit/tax accuracy
- override deterministic quantities without validation
- access sensitive customer/seller documents without explicit permission

Prompt inputs should be structured aggregates, definitions and source links/IDs. Outputs should cite internal record IDs or dashboard drill-down targets.
