import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Paper } from '../../../core/models/paper';
import { GalaxyTopic } from '../analysis/galaxy-analysis';
import { TopicHighlights, percent } from '../analysis/topic-stats';
import { TOPIC_SHAPES, starPath, topicColour } from '../galaxy-palette';
import { topicSearch } from '../topic-search';

/**
 * The topics, with how many of their papers the time-lapse has shown and the share published in
 * recent years. Choosing one highlights it on the map and shows what sets it apart, with a link
 * that searches for the topic within the query.
 */
@Component({
  selector: 'app-galaxy-legend',
  imports: [RouterLink],
  templateUrl: './galaxy-legend.html',
  styleUrl: './galaxy-legend.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GalaxyLegend {
  readonly topics = input.required<readonly GalaxyTopic[]>();
  /** Papers of each topic shown so far. */
  readonly counts = input.required<readonly number[]>();
  readonly highlights = input.required<TopicHighlights>();
  readonly selected = input<number | null>(null);
  readonly query = input.required<string>();
  readonly papers = input.required<readonly Paper[]>();
  readonly selectedChange = output<number | null>();

  protected readonly items = computed(() =>
    this.topics().map((topic, i) => ({
      topic,
      swatch: starPath(i, 5),
      colour: topicColour(i),
      shape: TOPIC_SHAPES[i % TOPIC_SHAPES.length],
      share: topic.recentShare === null ? null : percent(topic.recentShare),
    })),
  );

  protected readonly detail = computed(() => {
    const index = this.selected();
    const topic = index === null ? undefined : this.topics()[index];
    if (index === null || !topic) {
      return null;
    }
    const papers = this.papers();
    return {
      index,
      topic,
      share: topic.recentShare === null ? null : percent(topic.recentShare),
      typical: topic.papers.slice(0, 3).map((i) => papers[i]),
      search: topicSearch(this.query(), topic),
    };
  });

  protected toggle(index: number): void {
    this.selectedChange.emit(this.selected() === index ? null : index);
  }
}
