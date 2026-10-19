module tipitaka.app/server

go 1.27

require github.com/mattn/go-sqlite3 v1.14.52

require (
	github.com/klauspost/compress v1.20.1
	github.com/pnfo/pali-converter v0.0.0-00010101000000-000000000000
	github.com/skratchdot/open-golang v0.0.0-20200116055534-eef842397966
	golang.org/x/text v0.42.0
)

require (
	golang.org/x/mobile v0.0.0-20260908204917-8b95e45f8d3e // indirect
	golang.org/x/mod v0.41.0 // indirect
	golang.org/x/sync v0.23.0 // indirect
	golang.org/x/tools v0.50.0 // indirect
)

replace github.com/pnfo/pali-converter => ./pali-converter
