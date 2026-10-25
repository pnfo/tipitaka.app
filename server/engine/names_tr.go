package engine

import (
	"context"
	"strings"
)

// The descriptions of the names in the interface language (table entity_tr, build/names/translations.ts): the
// names ops take lang=<code> and add the meaning and family in it (meaningLocal, familyLocal) where there is one.

type nameText struct{ meaning, family string }

var nameOps = map[string]bool{"names": true, "entity": true, "settings": true, "paranames": true}

// nameTexts returns the translations of a language (nil: none), read once.
func (e *Engine) nameTexts(ctx context.Context, lang string) map[string]nameText {
	if e.nameTr == nil || lang == "" || lang == "en" {
		return nil
	}
	e.nameTrMu.Lock()
	defer e.nameTrMu.Unlock()
	if m, ok := e.nameTr[lang]; ok {
		return m
	}
	m := map[string]nameText{}
	rows, err := e.text.QueryContext(ctx, "SELECT e.slug, t.meaning, t.family FROM entity_tr t JOIN entity e ON e.id = t.entity_id WHERE t.lang = ?", lang)
	if err != nil {
		return nil
	}
	defer rows.Close()
	for rows.Next() {
		var slug string
		var t nameText
		if rows.Scan(&slug, &t.meaning, &t.family) == nil {
			m[slug] = t
		}
	}
	if rows.Err() != nil {
		return nil // (not kept: read again next time)
	}
	e.nameTr[lang] = m
	return m
}

func (t nameText) apply(en *Entity) {
	en.MeaningLocal, en.FamilyLocal = t.meaning, t.family
}

// localizeNames puts the translations into the entities of a names op result.
func (e *Engine) localizeNames(ctx context.Context, res any, lang string) {
	m := e.nameTexts(ctx, strings.ToLower(lang))
	if m == nil {
		return
	}
	one := func(en *Entity) { m[en.Slug].apply(en) }
	switch v := res.(type) {
	case []Entity:
		for i := range v {
			one(&v[i])
		}
	case *EntityInfo:
		if v == nil {
			return
		}
		one(&v.Entity)
		for i := range v.Related {
			one(&v.Related[i].Entity)
		}
		for i := range v.Homonyms {
			one(&v.Homonyms[i])
		}
		for i := range v.Comentions {
			one(&v.Comentions[i].Entity)
		}
	case *UnitSetting:
		if v == nil {
			return
		}
		for i := range v.Rows {
			one(&v.Rows[i].Entity)
		}
	case []ParaName:
		for i := range v {
			one(&v[i].Entity)
		}
	}
}
