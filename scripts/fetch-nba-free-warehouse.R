# Free NBA warehouse fetch template using SportsDataverse hoopR.
# Run outside Vercel on your local machine/worker, then commit/copy the generated CSVs to data/nba/raw.
#
# install.packages("hoopR")
# Rscript scripts/fetch-nba-free-warehouse.R 2002 2026 data/nba/raw

args <- commandArgs(trailingOnly = TRUE)
start_season <- ifelse(length(args) >= 1, as.integer(args[[1]]), 2002)
end_season <- ifelse(length(args) >= 2, as.integer(args[[2]]), as.integer(format(Sys.Date(), "%Y")))
out_dir <- ifelse(length(args) >= 3, args[[3]], "data/nba/raw")
seasons <- start_season:end_season

if (!requireNamespace("hoopR", quietly = TRUE)) {
  stop("Missing hoopR. Install it with: install.packages('hoopR')")
}

if (!requireNamespace("readr", quietly = TRUE)) {
  install.packages("readr", repos = "https://cloud.r-project.org")
}

dir.create(out_dir, recursive = TRUE, showWarnings = FALSE)

message("Loading NBA play-by-play seasons: ", paste(range(seasons), collapse = "-"))
pbp <- hoopR::load_nba_pbp(seasons = seasons)
readr::write_csv(pbp, file.path(out_dir, "nba_pbp.csv"))

message("Loading NBA schedule seasons: ", paste(range(seasons), collapse = "-"))
schedule <- hoopR::load_nba_schedule(seasons = seasons)
readr::write_csv(schedule, file.path(out_dir, "nba_schedule.csv"))

message("Loading NBA team box seasons: ", paste(range(seasons), collapse = "-"))
team_box <- hoopR::load_nba_team_box(seasons = seasons)
readr::write_csv(team_box, file.path(out_dir, "nba_team_box.csv"))

message("Loading NBA player box seasons: ", paste(range(seasons), collapse = "-"))
player_box <- hoopR::load_nba_player_box(seasons = seasons)
readr::write_csv(player_box, file.path(out_dir, "nba_player_box.csv"))

summary <- list(
  ok = TRUE,
  source = "hoopR",
  seasons = seasons,
  out_dir = out_dir,
  rows = list(
    pbp = nrow(pbp),
    schedule = nrow(schedule),
    team_box = nrow(team_box),
    player_box = nrow(player_box)
  )
)

print(summary)
