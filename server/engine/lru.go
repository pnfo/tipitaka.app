package engine

import (
	"container/list"
	"sync"
)

// lru is a small thread safe LRU cache (search results for paging).
type lru struct {
	mu    sync.Mutex
	max   int
	ll    *list.List
	items map[string]*list.Element
}

type lruEntry struct {
	key string
	val any
}

func newLRU(max int) *lru {
	return &lru{max: max, ll: list.New(), items: map[string]*list.Element{}}
}

func (c *lru) get(k string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[k]; ok {
		c.ll.MoveToFront(el)
		return el.Value.(*lruEntry).val, true
	}
	return nil, false
}

func (c *lru) put(k string, v any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.items[k]; ok {
		el.Value.(*lruEntry).val = v
		c.ll.MoveToFront(el)
		return
	}
	c.items[k] = c.ll.PushFront(&lruEntry{k, v})
	if c.ll.Len() > c.max {
		last := c.ll.Back()
		c.ll.Remove(last)
		delete(c.items, last.Value.(*lruEntry).key)
	}
}
