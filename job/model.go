package job

type Project struct {
	Id        string
	Video     string
	Silent    bool
	Subtitles []Subtitle
}

type Subtitle struct {
	Text     string
	Time     float64
	Duration float64
	Color    string
	Position struct {
		X string
		Y string
	}
}
