import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  linkedSignal,
  output,
  signal,
  viewChildren,
} from '@angular/core';
import { Paper } from '../../../core/models/paper';
import { GalaxyResult } from '../analysis/galaxy-analysis';
import { hashString, seededRandom } from '../analysis/kmeans';
import { starPath, topicColour } from '../galaxy-palette';
import { Box, Direction, centroid, nearestInDirection, placeLabels } from '../sky-geometry';

/** Where the year counter sits, top left, so topic names keep clear of it. */
const COUNTER_BOX: Box = { x: 0, y: 0, width: 132, height: 60 };
/** Average width of a character of a topic name, in pixels at 13 px semibold. */
const CHAR_WIDTH = 7.2;
/** Below this width, topic names on the map keep only their first term. */
const NARROW_SKY = 480;
const HIT_RADIUS = 12;
const ARROWS: Partial<Record<string, Direction>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
};

let nextId = 0;

/**
 * The night sky itself, as SVG: a star per paper in its topic's colour and shape, bigger and
 * glowing when recent, faint constellation lines between related papers, a nebula behind each
 * topic and its name nearby. Stars are links to the papers, one tab stop moved with the arrow keys
 * (towards the nearest star in that direction, or within the selected topic); hovering or focusing
 * one shows its details.
 */
@Component({
  selector: 'app-galaxy-sky',
  templateUrl: './galaxy-sky.html',
  styleUrl: './galaxy-sky.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.still]': 'reducedMotion()', '(click)': 'onClick($event)' },
})
export class GalaxySky {
  readonly result = input.required<GalaxyResult>();
  readonly papers = input.required<readonly Paper[]>();
  /** Which stars the time-lapse has reached. */
  readonly visible = input.required<readonly boolean[]>();
  /** The year the time-lapse has reached, or null when no paper has a year. */
  readonly year = input<number | null>(null);
  readonly playing = input(false);
  /** The highlighted topic, if any. */
  readonly selected = input<number | null>(null);
  /** Seeds the background stars, so they stay put for a search. */
  readonly query = input('');
  readonly reducedMotion = input(false);
  readonly topicSelected = output<number>();
  readonly cleared = output<void>();

  private readonly links = viewChildren<ElementRef<SVGAElement>>('star');
  protected readonly id = `galaxy-sky-${nextId++}`;
  protected readonly hitRadius = HIT_RADIUS;
  /** The star under the pointer or with focus, which gets the tooltip. */
  protected readonly active = signal<number | null>(null);
  private readonly tabStop = linkedSignal(() => this.result().topics[0]?.papers[0] ?? 0);

  protected readonly colours = computed(() => this.result().topics.map((_, t) => topicColour(t)));

  protected readonly stars = computed(() => {
    const result = this.result();
    const papers = this.papers();
    const random = seededRandom(hashString(this.query()) ^ 0x9e3779b9);
    return result.x.map((x, i) => {
      const topic = result.topicOf[i];
      const paper = papers[i];
      const y = result.y[i];
      const r = result.radius[i];
      return {
        index: i,
        topic,
        r,
        year: paper.year,
        transform: `translate(${x} ${y})`,
        path: starPath(topic, r),
        colour: topicColour(topic),
        glow: paper.year !== null && paper.year >= result.highlights.since,
        delay: `${-Math.round(random() * 4000)}ms`,
        url: paper.sourceUrl,
        label: describe(paper, result.topics[topic].label),
      };
    });
  });

  private readonly points = computed(() => {
    const { x, y } = this.result();
    return x.map((value, i) => ({ x: value, y: y[i] }));
  });

  /** Tab lands on this star: the last one focused, if it can be reached, or a typical one. */
  protected readonly focusable = computed(() => {
    const { topics, topicOf } = this.result();
    const visible = this.visible();
    const selected = this.selected();
    const reachable = (i: number) => visible[i] && (selected === null || topicOf[i] === selected);
    const current = this.tabStop();
    if (reachable(current)) {
      return current;
    }
    const candidates =
      selected === null ? topics.flatMap((t) => t.papers) : topics[selected].papers;
    return candidates.find(reachable) ?? -1;
  });

  protected readonly nebulae = computed(() => {
    const result = this.result();
    const visible = this.visible();
    return result.topics.map((topic, t) => {
      const members = topic.papers.map((i) => ({ x: result.x[i], y: result.y[i] }));
      const centre = centroid(members);
      const spread = (axis: 'x' | 'y') =>
        Math.sqrt(
          members.reduce((sum, p) => sum + (p[axis] - centre[axis]) ** 2, 0) / members.length,
        );
      const shown = topic.papers.filter((i) => visible[i]).length / topic.papers.length;
      return {
        topic: t,
        cx: centre.x,
        cy: centre.y,
        rx: Math.min(result.width / 3, spread('x') * 1.9 + 28),
        ry: Math.min(result.height / 2.5, spread('y') * 1.9 + 28),
        opacity: Math.round(shown ** 0.7 * 100) / 100,
      };
    });
  });

  protected readonly constellations = computed(() => {
    const { edges, topicOf, topics, x, y } = this.result();
    const visible = this.visible();
    const paths = topics.map(() => '');
    for (const [a, b] of edges) {
      if (visible[a] && visible[b]) {
        paths[topicOf[a]] += `M${x[a]},${y[a]}L${x[b]},${y[b]}`;
      }
    }
    return paths.map((d, topic) => ({ topic, d, colour: topicColour(topic) }));
  });

  protected readonly labels = computed(() => {
    const result = this.result();
    const narrow = result.width < NARROW_SKY;
    const requests = result.topics.map((topic) => {
      const text = narrow ? topic.label.split(' · ')[0] : topic.label;
      return {
        text,
        members: topic.papers.map((i) => ({ x: result.x[i], y: result.y[i] })),
        width: Math.ceil(text.length * CHAR_WIDTH) + 22,
        height: 20,
      };
    });
    const stars = result.x.map((x, i) => ({ x, y: result.y[i], r: result.radius[i] }));
    return placeLabels(requests, stars, result, [COUNTER_BOX]).map((place, topic) => ({
      ...place,
      topic,
      text: requests[topic].text,
      left: -requests[topic].width / 2,
      glyph: starPath(topic, 4),
      colour: topicColour(topic),
    }));
  });

  /** Topics with at least one star shown so far. */
  protected readonly litTopics = computed(() => {
    const { topics } = this.result();
    const visible = this.visible();
    return topics.map((topic) => topic.papers.some((i) => visible[i]));
  });

  protected readonly backgroundStars = computed(() => {
    const { width, height } = this.result();
    const random = seededRandom(hashString(this.query()) ^ 0x51ed270b);
    const layers = ['', '', ''];
    const count = Math.round((width * height) / 3200);
    for (let i = 0; i < count; i++) {
      const x = random() * width;
      const y = random() * height;
      const r = Math.round((0.4 + random() * 0.8) * 100) / 100;
      layers[i % 3] +=
        `M${round(x - r)},${round(y)}a${r},${r} 0 1,0 ${2 * r},0a${r},${r} 0 1,0 ${-2 * r},0`;
    }
    return layers;
  });

  protected readonly summary = computed(() => {
    const { topics } = this.result();
    return `Galaxy of ${this.papers().length} papers in ${topics.length} ${topics.length === 1 ? 'topic' : 'topics'}`;
  });

  protected readonly tooltip = computed(() => {
    const index = this.active();
    const result = this.result();
    if (index === null || !this.visible()[index]) {
      return null;
    }
    const paper = this.papers()[index];
    const topic = result.topicOf[index];
    const left = (result.x[index] / result.width) * 100;
    const top = (result.y[index] / result.height) * 100;
    return {
      title: paper.title,
      meta: [paper.year, authorsText(paper.authors)].filter(Boolean).join(' · '),
      topic: result.topics[topic].label,
      path: starPath(topic, 5),
      colour: topicColour(topic),
      left,
      top,
      flip: left > 58,
      below: top < 34,
    };
  });

  protected focus(index: number): void {
    this.tabStop.set(index);
    this.active.set(index);
  }

  protected blur(index: number): void {
    if (this.active() === index) {
      this.active.set(null);
    }
  }

  /**
   * A topic's name on the map highlights it, and the empty sky clears the highlight. Both are
   * shortcuts for the pointer; the legend does the same from the keyboard.
   */
  protected onClick(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target : null;
    const label = target?.closest<SVGGElement>('.label');
    if (label?.dataset['topic'] !== undefined) {
      this.topicSelected.emit(Number(label.dataset['topic']));
    } else if (target?.classList.contains('backdrop')) {
      this.cleared.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent, index: number): void {
    const direction = ARROWS[event.key];
    if (direction) {
      event.preventDefault();
      const { topicOf } = this.result();
      const visible = this.visible();
      const selected = this.selected();
      const next = nearestInDirection(
        this.points(),
        index,
        direction,
        (i) => visible[i] && (selected === null || topicOf[i] === selected),
      );
      if (next !== null) {
        this.tabStop.set(next);
        this.links()[next]?.nativeElement.focus();
      }
    } else if (event.key === 'Escape') {
      this.active.set(null);
      this.cleared.emit();
    }
  }
}

/** "Title, 2021, by Ada Lovelace and Alan Turing. Topic: truck · cost. Opens in a new tab." */
function describe(paper: Paper, topic: string): string {
  const authors = authorsText(paper.authors);
  const work = `${paper.title}, ${paper.year ?? 'year unknown'}${authors ? `, by ${authors}` : ''}`;
  return `${work.replace(/\.?$/, '.')} Topic: ${topic}. Opens in a new tab.`;
}

function authorsText(authors: readonly string[]): string {
  if (authors.length <= 2) {
    return authors.join(' and ');
  }
  return `${authors[0]}, ${authors[1]} et al.`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
