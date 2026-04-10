from __future__ import annotations

from datetime import datetime, timezone
from statistics import mean, median
from typing import Any


def american_to_decimal(american: int | float) -> float:
    if american == 0:
        raise ValueError("American odds cannot be 0")
    if american > 0:
        return round((american / 100.0) + 1.0, 6)
    return round((100.0 / abs(float(american))) + 1.0, 6)


def decimal_to_american_safe(decimal: float) -> int | None:
    if decimal <= 1.0:
        return None
    if decimal >= 2.0:
        return int(round((decimal - 1.0) * 100.0))
    return int(round(-100.0 / (decimal - 1.0)))


def implied_probability(american: int | float) -> float | None:
    try:
        return round(1.0 / american_to_decimal(american), 6)
    except (ValueError, ZeroDivisionError):
        return None


def vig_strip(prices: list[int | float]) -> list[float]:
    if len(prices) < 2:
        return []
    try:
        decimals = [american_to_decimal(price) for price in prices]
    except (ValueError, ZeroDivisionError):
        return []
    raw = [1.0 / decimal for decimal in decimals]
    total = sum(raw)
    if total <= 0:
        return []
    return [round(prob / total, 6) for prob in raw]


def calculate_ev(fair_prob: float, offered_price: int | float) -> float | None:
    if fair_prob <= 0 or fair_prob >= 1:
        return None
    try:
        decimal = american_to_decimal(offered_price)
    except (ValueError, ZeroDivisionError):
        return None
    return round((fair_prob * decimal) - 1.0, 6)


def kelly_criterion(
    fair_prob: float,
    offered_price: int | float,
    fraction: float = 0.25,
) -> float | None:
    if fair_prob <= 0 or fair_prob >= 1:
        return None
    try:
        decimal = american_to_decimal(offered_price)
    except (ValueError, ZeroDivisionError):
        return None
    b = decimal - 1.0
    if b <= 0:
        return None
    q = 1.0 - fair_prob
    full = (b * fair_prob - q) / b
    if full <= 0:
        return 0.0
    return round(full * fraction, 6)


def vig_percentage(prices: list[int | float]) -> float | None:
    if len(prices) < 2:
        return None
    try:
        decimals = [american_to_decimal(price) for price in prices]
    except (ValueError, ZeroDivisionError):
        return None
    overround = sum(1.0 / decimal for decimal in decimals)
    return round((overround - 1.0) * 100.0, 4)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _coerce_numeric(value: Any) -> float | int | None:
    return value if isinstance(value, (int, float)) else None


def _build_sharp_reference_payload(
    market_name: str,
    ordered: list[dict[str, Any]],
    sharp_reference_market: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if not isinstance(sharp_reference_market, dict):
        return None

    if market_name == "moneyline":
        away_price = _coerce_numeric(sharp_reference_market.get("away"))
        home_price = _coerce_numeric(sharp_reference_market.get("home"))
        if away_price is None or home_price is None:
            return None
        return {"prices": [away_price, home_price], "line": None}

    if market_name == "spread":
        away_price = _coerce_numeric(sharp_reference_market.get("away_odds"))
        home_price = _coerce_numeric(sharp_reference_market.get("home_odds"))
        away_line = _coerce_numeric(sharp_reference_market.get("away"))
        home_line = _coerce_numeric(sharp_reference_market.get("home"))
        away_consensus = _coerce_numeric(ordered[0].get("consensus_point"))
        home_consensus = _coerce_numeric(ordered[1].get("consensus_point"))
        if (
            away_price is None
            or home_price is None
            or away_line is None
            or home_line is None
            or away_consensus is None
            or home_consensus is None
        ):
            return None
        if abs(away_line - away_consensus) > 0.01 or abs(home_line - home_consensus) > 0.01:
            return None
        return {"prices": [away_price, home_price], "line": away_line}

    if market_name == "total":
        over_price = _coerce_numeric(sharp_reference_market.get("over"))
        under_price = _coerce_numeric(sharp_reference_market.get("under"))
        line = _coerce_numeric(sharp_reference_market.get("line"))
        consensus_line = _coerce_numeric(ordered[0].get("consensus_point"))
        if over_price is None or under_price is None or line is None or consensus_line is None:
            return None
        if abs(line - consensus_line) > 0.01:
            return None
        return {"prices": [over_price, under_price], "line": line}

    return None


def build_edge_analytics_for_market(
    market_stats: list[dict[str, Any]],
    outcome_names: list[str],
    market_name: str,
    sharp_reference: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if not market_stats or len(market_stats) < 2:
        return {"available": False, "reason": "insufficient_market_data"}

    ordered: list[dict[str, Any]] = []
    stat_map = {str(item.get("name")): item for item in market_stats if item.get("name")}
    for name in outcome_names:
        stat = stat_map.get(name)
        if not stat:
            return {"available": False, "reason": f"missing_outcome_{name}"}
        ordered.append(stat)

    avg_prices: list[int | float | None] = [_coerce_numeric(item.get("average_price")) for item in ordered]
    if any(price is None for price in avg_prices):
        avg_prices = [_coerce_numeric(item.get("best_price")) for item in ordered]
    if any(price is None for price in avg_prices):
        return {"available": False, "reason": "no_prices"}

    reference_payload = _build_sharp_reference_payload(market_name, ordered, sharp_reference)
    fair_source_prices = (
        reference_payload["prices"] if reference_payload else [price for price in avg_prices if price is not None]
    )
    fair_probs = vig_strip(fair_source_prices)
    if len(fair_probs) != len(ordered):
        return {"available": False, "reason": "vig_strip_failed"}

    market_vig = vig_percentage(fair_source_prices)
    outcomes_out: list[dict[str, Any]] = []

    for stat, fair_prob in zip(ordered, fair_probs):
        best_price = _coerce_numeric(stat.get("best_price"))
        avg_price = _coerce_numeric(stat.get("average_price"))
        ev = calculate_ev(fair_prob, best_price) if best_price is not None else None
        kelly = kelly_criterion(fair_prob, best_price) if best_price is not None else None
        outcomes_out.append(
            {
                "name": stat.get("name"),
                "fair_probability": fair_prob,
                "fair_probability_pct": round(fair_prob * 100.0, 2),
                "fair_american": decimal_to_american_safe(1.0 / fair_prob) if fair_prob > 0 else None,
                "best_price": best_price,
                "average_price": avg_price,
                "best_bookmakers": list(stat.get("best_bookmakers") or []),
                "book_count": int(stat.get("book_count") or 0),
                "consensus_point": _coerce_numeric(stat.get("consensus_point")),
                "point_frequency": int(stat.get("point_frequency") or 0),
                "ev": ev,
                "ev_pct": round(ev * 100.0, 3) if ev is not None else None,
                "kelly_fraction": kelly,
                "kelly_pct": round(kelly * 100.0, 2) if kelly is not None else None,
                "has_edge": ev is not None and ev > 0,
                "price_vs_average": round(best_price - avg_price, 2)
                if best_price is not None and avg_price is not None
                else None,
                "pricing_method": "sharp_reference" if reference_payload else "consensus_average",
            }
        )

    best_ev = max((item["ev"] for item in outcomes_out if item.get("ev") is not None), default=None)
    best_outcome = next((item["name"] for item in outcomes_out if item.get("ev") == best_ev), None)

    return {
        "available": True,
        "vig_pct": market_vig,
        "outcomes": outcomes_out,
        "best_ev": best_ev,
        "best_ev_pct": round(best_ev * 100.0, 3) if best_ev is not None else None,
        "best_outcome": best_outcome,
        "any_edge": any(item["has_edge"] for item in outcomes_out),
        "pricing_method": "sharp_reference" if reference_payload else "consensus_average",
        "reference_line": reference_payload.get("line") if reference_payload else None,
        "reference_source": sharp_reference.get("source") if isinstance(sharp_reference, dict) else None,
        "reference_book": sharp_reference.get("book_name") if isinstance(sharp_reference, dict) else None,
    }


def _score_ev(best_ev: float | None) -> float:
    if best_ev is None or best_ev <= 0:
        return 0.0
    return round(min(40.0, best_ev * 800.0), 2)


def _score_book_consensus(max_book_count: int, total_books: int) -> float:
    if total_books <= 0:
        return 0.0
    return round(min(20.0, (max_book_count / total_books) * 20.0), 2)


def _score_vig(vig_pct: float | None) -> float:
    if vig_pct is None:
        return 0.0
    if vig_pct <= 3.5:
        return 15.0
    if vig_pct >= 8.0:
        return 0.0
    return round(((8.0 - vig_pct) / 4.5) * 15.0, 2)


def _score_line_movement(movement_direction: str | None) -> float:
    if movement_direction == "sharp_favorable":
        return 25.0
    if movement_direction == "sharp_unfavorable":
        return 0.0
    return 5.0


def build_sharkscore(
    moneyline_analytics: dict[str, Any],
    spread_analytics: dict[str, Any],
    total_analytics: dict[str, Any],
    bookmakers_available: int = 1,
    movement_direction: str | None = None,
) -> dict[str, Any]:
    best_ev = None
    best_ev_market = None
    max_book_count = 0
    best_vig = None

    for market_name, analytics in (
        ("moneyline", moneyline_analytics),
        ("spread", spread_analytics),
        ("total", total_analytics),
    ):
        if not analytics.get("available"):
            continue
        market_best_ev = analytics.get("best_ev")
        if market_best_ev is not None and (best_ev is None or market_best_ev > best_ev):
            best_ev = market_best_ev
            best_ev_market = market_name
        market_vig = analytics.get("vig_pct")
        if market_vig is not None and (best_vig is None or market_vig < best_vig):
            best_vig = market_vig
        for outcome in analytics.get("outcomes", []):
            max_book_count = max(max_book_count, int(outcome.get("book_count") or 0))

    ev_score = _score_ev(best_ev)
    consensus_score = _score_book_consensus(max_book_count, max(bookmakers_available, 1))
    vig_score = _score_vig(best_vig)
    move_score = _score_line_movement(movement_direction)
    total_score = round(ev_score + consensus_score + vig_score + move_score, 1)

    if total_score >= 75:
        label, tier = "SHARK", "S"
    elif total_score >= 55:
        label, tier = "SHARP", "A"
    elif total_score >= 38:
        label, tier = "VALUE", "B"
    elif total_score >= 22:
        label, tier = "NEUTRAL", "C"
    else:
        label, tier = "FADE", "D"

    return {
        "score": total_score,
        "label": label,
        "tier": tier,
        "best_ev_market": best_ev_market,
        "best_ev": best_ev,
        "best_ev_pct": round(best_ev * 100.0, 3) if best_ev is not None else None,
        "components": {
            "ev": ev_score,
            "book_consensus": consensus_score,
            "market_efficiency": vig_score,
            "line_movement": move_score,
        },
        "movement_signal": movement_direction or "neutral",
    }


def build_sharp_signals(
    bookmakers: list[dict[str, Any]],
    away_team: str,
    home_team: str,
    sharp_reference: dict[str, Any] | None = None,
    source_diagnostics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    moneyline_prices: dict[str, list[int]] = {away_team: [], home_team: []}
    spread_points: dict[str, list[float]] = {away_team: [], home_team: []}
    spread_prices: dict[str, list[int]] = {away_team: [], home_team: []}

    for bookmaker in bookmakers or []:
        markets = bookmaker.get("markets") or {}
        for outcome in markets.get("moneyline", []):
            name = outcome.get("name")
            price = outcome.get("price")
            if name in moneyline_prices and isinstance(price, (int, float)):
                moneyline_prices[name].append(int(price))
        for outcome in markets.get("spread", []):
            name = outcome.get("name")
            point = outcome.get("point")
            price = outcome.get("price")
            if name in spread_points and isinstance(point, (int, float)):
                spread_points[name].append(float(point))
            if name in spread_prices and isinstance(price, (int, float)):
                spread_prices[name].append(int(price))

    signals: dict[str, Any] = {}

    for team in (away_team, home_team):
        team_points = spread_points.get(team, [])
        span = round(max(team_points) - min(team_points), 2) if len(team_points) >= 2 else None
        key_prefix = team.lower().replace(" ", "_")
        signals[f"{key_prefix}_spread_span"] = span
        signals[f"{key_prefix}_steam_alert"] = bool(span is not None and span >= 1.5)

    away_ml = mean(moneyline_prices[away_team]) if moneyline_prices[away_team] else None
    home_ml = mean(moneyline_prices[home_team]) if moneyline_prices[home_team] else None
    reference_moneyline = sharp_reference.get("moneyline") if isinstance(sharp_reference, dict) else None
    reference_spread = sharp_reference.get("spread") if isinstance(sharp_reference, dict) else None
    if isinstance(reference_moneyline, dict):
        away_ml = _coerce_numeric(reference_moneyline.get("away")) or away_ml
        home_ml = _coerce_numeric(reference_moneyline.get("home")) or home_ml
    favorite = None
    if away_ml is not None and home_ml is not None:
        favorite = away_team if away_ml < home_ml else home_team if home_ml < away_ml else None
    dog = home_team if favorite == away_team else away_team if favorite == home_team else None

    movement_direction = "neutral"
    estimated_sharp_lean: str | None = None
    estimated_lean_magnitude = None
    away_avg_spread = mean(spread_points[away_team]) if spread_points[away_team] else None
    home_avg_spread = mean(spread_points[home_team]) if spread_points[home_team] else None
    if isinstance(reference_spread, dict):
        away_avg_spread = _coerce_numeric(reference_spread.get("away")) or away_avg_spread
        home_avg_spread = _coerce_numeric(reference_spread.get("home")) or home_avg_spread
    if away_avg_spread is not None and home_avg_spread is not None:
        # More negative spread indicates stronger market support for that team.
        if away_avg_spread <= -0.5:
            estimated_sharp_lean = away_team
            estimated_lean_magnitude = round(abs(away_avg_spread), 2)
            movement_direction = "sharp_favorable"
        elif home_avg_spread <= -0.5:
            estimated_sharp_lean = home_team
            estimated_lean_magnitude = round(abs(home_avg_spread), 2)
            movement_direction = "sharp_favorable"
        else:
            estimated_sharp_lean = "neutral"
            estimated_lean_magnitude = 0.0
    else:
        estimated_sharp_lean = None

    signals.update(
        {
            "favorite": favorite,
            "dog": dog,
            "estimated_sharp_lean": estimated_sharp_lean,
            "estimated_lean_magnitude": estimated_lean_magnitude,
            "movement_direction": movement_direction,
            "books_sampled": len(bookmakers or []),
            "reference_source": sharp_reference.get("source") if isinstance(sharp_reference, dict) else None,
            "reference_book": sharp_reference.get("book_name") if isinstance(sharp_reference, dict) else None,
            "reference_available": isinstance(sharp_reference, dict),
            "source_diagnostics": source_diagnostics or {},
            "note": (
                "Sharp signals are inferred from cross-book line shape and spread dispersion. "
                "True reverse-line-movement classification still requires ticket or money splits."
            ),
        }
    )
    return signals


def build_game_edge_block(game: dict[str, Any]) -> dict[str, Any]:
    away_team = str(game.get("away_team") or "Away")
    home_team = str(game.get("home_team") or "Home")
    market_stats = game.get("market_stats") or {}
    bookmakers = game.get("bookmakers") or []
    sharp_reference = game.get("sharp_reference") if isinstance(game.get("sharp_reference"), dict) else None
    bookmakers_available = int(game.get("bookmakers_available") or len(bookmakers) or 1)

    moneyline = build_edge_analytics_for_market(
        market_stats.get("moneyline") or [],
        [away_team, home_team],
        "moneyline",
        sharp_reference=sharp_reference.get("moneyline") if sharp_reference else None,
    )
    spread = build_edge_analytics_for_market(
        market_stats.get("spread") or [],
        [away_team, home_team],
        "spread",
        sharp_reference=sharp_reference.get("spread") if sharp_reference else None,
    )
    total = build_edge_analytics_for_market(
        market_stats.get("total") or [],
        ["Over", "Under"],
        "total",
        sharp_reference=sharp_reference.get("total") if sharp_reference else None,
    )
    sharp_signals = build_sharp_signals(
        bookmakers,
        away_team,
        home_team,
        sharp_reference=sharp_reference,
        source_diagnostics=game.get("sharp_reference_diagnostics"),
    )
    sharkscore = build_sharkscore(
        moneyline,
        spread,
        total,
        bookmakers_available=bookmakers_available,
        movement_direction=sharp_signals.get("movement_direction"),
    )

    top_edges: list[dict[str, Any]] = []
    for market_name, analytics in (("moneyline", moneyline), ("spread", spread), ("total", total)):
        if not analytics.get("available"):
            continue
        for outcome in analytics.get("outcomes", []):
            if outcome.get("ev") is None:
                continue
            top_edges.append(
                {
                    "market": market_name,
                    "outcome": outcome.get("name"),
                    "ev": outcome.get("ev"),
                    "ev_pct": outcome.get("ev_pct"),
                    "price": outcome.get("best_price"),
                    "consensus_point": outcome.get("consensus_point"),
                    "bookmakers": outcome.get("best_bookmakers", []),
                    "has_edge": outcome.get("has_edge", False),
                }
            )
    top_edges.sort(key=lambda item: item.get("ev") or -999.0, reverse=True)

    return {
        "generated_at": _utc_now(),
        "sharkscore": sharkscore,
        "moneyline": moneyline,
        "spread": spread,
        "total": total,
        "sharp_signals": sharp_signals,
        "sharp_reference": sharp_reference,
        "top_edges": top_edges[:5],
    }


def _build_prop_ev(
    side: str,
    my_price: int | float | None,
    over_prices: list[int | float],
    under_prices: list[int | float],
) -> dict[str, Any]:
    if my_price is None or not over_prices or not under_prices:
        return {"available": False, "reason": "insufficient_cross_book_data"}

    over_consensus = median(over_prices)
    under_consensus = median(under_prices)
    fair_probs = vig_strip([over_consensus, under_consensus])
    if len(fair_probs) != 2:
        return {"available": False, "reason": "vig_strip_failed"}

    side_upper = str(side).upper()
    if side_upper == "OVER":
        fair_prob = fair_probs[0]
        best_same_side = max(over_prices)
    elif side_upper == "UNDER":
        fair_prob = fair_probs[1]
        best_same_side = max(under_prices)
    else:
        return {"available": False, "reason": "unknown_side"}

    ev = calculate_ev(fair_prob, my_price)
    kelly = kelly_criterion(fair_prob, my_price)
    market_vig = vig_percentage([over_consensus, under_consensus])
    return {
        "available": True,
        "fair_probability": fair_prob,
        "fair_probability_pct": round(fair_prob * 100.0, 2),
        "fair_american": decimal_to_american_safe(1.0 / fair_prob),
        "ev": ev,
        "ev_pct": round(ev * 100.0, 3) if ev is not None else None,
        "kelly_fraction": kelly,
        "kelly_pct": round(kelly * 100.0, 2) if kelly is not None else None,
        "has_edge": ev is not None and ev > 0,
        "market_vig_pct": market_vig,
        "best_available_price": best_same_side,
        "price_vs_best": round(float(my_price) - float(best_same_side), 2),
        "books_sampled": {"over": len(over_prices), "under": len(under_prices)},
    }


def enrich_props_with_ev(props: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[tuple[str, str, float | int | None], list[dict[str, Any]]] = {}
    for prop in props:
        key = (str(prop.get("player_name") or ""), str(prop.get("market_key") or ""), prop.get("line"))
        grouped.setdefault(key, []).append(prop)

    enriched: list[dict[str, Any]] = []
    for prop in props:
        key = (str(prop.get("player_name") or ""), str(prop.get("market_key") or ""), prop.get("line"))
        group = grouped.get(key, [])
        over_prices = [item["price"] for item in group if item.get("side") == "OVER" and isinstance(item.get("price"), (int, float))]
        under_prices = [item["price"] for item in group if item.get("side") == "UNDER" and isinstance(item.get("price"), (int, float))]
        enriched_prop = dict(prop)
        enriched_prop["ev_analytics"] = _build_prop_ev(prop.get("side", ""), prop.get("price"), over_prices, under_prices)
        enriched.append(enriched_prop)

    enriched.sort(
        key=lambda item: (
            -(item.get("ev_analytics", {}).get("ev") or -999.0),
            item.get("player_name") or "",
            item.get("market_key") or "",
        )
    )
    return enriched


def build_top_prop_feed(props: list[dict[str, Any]], limit: int = 25) -> list[dict[str, Any]]:
    ranked: list[dict[str, Any]] = []
    for prop in props:
        analytics = prop.get("ev_analytics") or {}
        if not analytics.get("available"):
            continue
        ranked.append(
            {
                "id": prop.get("id"),
                "event_id": prop.get("event_id"),
                "player_name": prop.get("player_name"),
                "market_key": prop.get("market_key"),
                "side": prop.get("side"),
                "line": prop.get("line"),
                "price": prop.get("price"),
                "bookmaker_title": prop.get("bookmaker_title"),
                "team_name": prop.get("team_name"),
                "opponent_name": prop.get("opponent_name"),
                "ev_pct": analytics.get("ev_pct"),
                "kelly_pct": analytics.get("kelly_pct"),
                "fair_american": analytics.get("fair_american"),
                "best_available_price": analytics.get("best_available_price"),
                "price_vs_best": analytics.get("price_vs_best"),
                "has_edge": analytics.get("has_edge"),
            }
        )
    ranked.sort(key=lambda item: item.get("ev_pct") or -999.0, reverse=True)
    return ranked[:limit]
