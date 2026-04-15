# SharkEdge nuclear patch

## 1) Import in `main.py`

```python
from sharkedge_analytics import (
    build_game_edge_block,
    build_top_prop_feed,
    enrich_props_with_ev,
)
```

## 2) Patch `normalize_game()`

After the existing normalized game dict is created, attach analytics:

```python
normalized = {
    "id": game.get("id"),
    "commence_time": game.get("commence_time"),
    "home_team": home_team,
    "away_team": away_team,
    "bookmakers_available": len(normalized_bookmakers),
    "bookmakers": normalized_bookmakers,
    "market_stats": {
        "moneyline": summarize_market(normalized_bookmakers, "moneyline", [away_team, home_team]),
        "spread": summarize_market(normalized_bookmakers, "spread", [away_team, home_team]),
        "total": summarize_market(normalized_bookmakers, "total", ["Over", "Under"]),
    },
}
normalized["edge_analytics"] = build_game_edge_block(normalized)
normalized["sharp_signals"] = normalized["edge_analytics"]["sharp_signals"]
return normalized
```

## 3) Patch `fetch_sport_prop_board()`

Before the return statement:

```python
props = enrich_props_with_ev(props)
top_props = build_top_prop_feed(props)
```

Then include both fields in the returned payload:

```python
"props": props,
"top_props": top_props,
```

## 4) Patch `build_game_detail()`

Add these fields into the returned payload:

```python
"edge_analytics": game.get("edge_analytics") or build_game_edge_block(game),
"sharp_signals": game.get("sharp_signals") or (game.get("edge_analytics") or {}).get("sharp_signals"),
```

## 5) Frontend contract

Expect these stable fields:

- `game.edge_analytics.sharkscore`
- `game.edge_analytics.top_edges`
- `game.sharp_signals`
- `prop.ev_analytics`
- `prop_board.top_props`

## 6) Product priority

1. live edge board
2. top props feed
3. closing-line-value tracking
4. line movement snapshots per market
5. consensus-vs-best dislocation alerts