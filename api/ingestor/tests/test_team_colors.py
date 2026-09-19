"""Events carry each team's logo and color (for the bet card's team bands),
matched by abbreviation or name; unknown teams get nulls."""
from app.extensions import db
from app.models.event import SCHEDULED, Event
from app.models.team import Team
from app.services.service_events import attach_logos


def test_attach_logos_adds_team_colors(app):
    db.session.add_all([
        Team(external_id="8", sport="football", league="nfl", name="Detroit Lions", abbreviation="DET",
             color="0076b6", logo="https://x/det.png"),
        Team(external_id="2", sport="football", league="nfl", name="Buffalo Bills", abbreviation="BUF",
             color="#00338d", logo="https://x/buf.png"),
    ])
    ev = Event(external_id="E1", sport="football", league="nfl", name="Lions at Bills",
               home_team="Buffalo Bills", home_abbr="BUF", away_team="Detroit Lions", away_abbr="DET",
               status=SCHEDULED)
    other = Event(external_id="E2", sport="football", league="nfl", name="Jets at Pats",
                  home_team="New England Patriots", away_team="New York Jets", status=SCHEDULED)
    db.session.add_all([ev, other])
    db.session.commit()

    d, unknown = attach_logos([ev, other])
    assert d["away_logo"] == "https://x/det.png"
    assert d["away_color"] == "#0076b6"
    assert d["home_color"] == "#00338d"  # a stored leading "#" isn't doubled
    assert unknown["home_color"] is None and unknown["away_color"] is None
