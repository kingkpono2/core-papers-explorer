import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import { Observable, Subscriber } from 'rxjs';
import {
  GalaxyInput,
  GalaxyRequest,
  GalaxyResponse,
  GalaxyResult,
} from './analysis/galaxy-analysis';

/** The smallest part of a worker the analyser needs, so tests can stand in for one. */
export interface GalaxyWorker {
  postMessage(message: GalaxyRequest): void;
  addEventListener(type: 'message', listener: (event: MessageEvent<GalaxyResponse>) => void): void;
  addEventListener(type: 'error', listener: (event: ErrorEvent) => void): void;
  terminate(): void;
}

/** Starts the worker, or returns null where there are no workers. */
export const GALAXY_WORKER = new InjectionToken<() => GalaxyWorker | null>('GALAXY_WORKER', {
  providedIn: 'root',
  factory: () => () =>
    typeof Worker === 'undefined'
      ? null
      : new Worker(new URL('./galaxy.worker', import.meta.url), { type: 'module' }),
});

/** A galaxy, and whether it was worked out in the worker or, without one, on the main thread. */
export interface AnalysedGalaxy extends GalaxyResult {
  thread: 'worker' | 'main';
}

interface Pending {
  input: GalaxyInput;
  subscriber: Subscriber<AnalysedGalaxy>;
}

/**
 * Runs the galaxy analysis in a web worker, started on first use and stopped with the page. Each
 * request gets its own id, so a late answer to a request nobody waits for any more is ignored.
 * Without a worker, or if it fails to start, the analysis runs on the main thread instead, loaded
 * only then.
 */
@Injectable()
export class GalaxyAnalyser {
  private readonly createWorker = inject(GALAXY_WORKER);
  private worker: GalaxyWorker | null | undefined;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.worker?.terminate();
      this.pending.clear();
    });
  }

  analyse(input: GalaxyInput): Observable<AnalysedGalaxy> {
    return new Observable<AnalysedGalaxy>((subscriber) => {
      const worker = this.startWorker();
      if (!worker) {
        return runOnMainThread(input, subscriber);
      }
      const id = this.nextId++;
      this.pending.set(id, { input, subscriber });
      worker.postMessage({ ...input, id });
      return () => this.pending.delete(id);
    });
  }

  private startWorker(): GalaxyWorker | null {
    if (this.worker !== undefined) {
      return this.worker;
    }
    try {
      this.worker = this.createWorker();
    } catch {
      this.worker = null;
    }
    this.worker?.addEventListener('message', ({ data }) => this.settle(data));
    this.worker?.addEventListener('error', (event) => {
      event.preventDefault();
      this.fallBack();
    });
    return this.worker;
  }

  private settle(response: GalaxyResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    this.pending.delete(response.id);
    if (response.ok) {
      pending.subscriber.next({ ...response.result, thread: 'worker' });
      pending.subscriber.complete();
    } else {
      pending.subscriber.error(new Error(response.error));
    }
  }

  /** A worker that could not start is not tried again; waiting requests run here instead. */
  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const { input, subscriber } of waiting) {
      subscriber.add(runOnMainThread(input, subscriber));
    }
  }
}

function runOnMainThread(input: GalaxyInput, subscriber: Subscriber<AnalysedGalaxy>): () => void {
  let cancelled = false;
  import('./analysis/galaxy-analysis').then(
    ({ analyseGalaxy }) => {
      if (cancelled) {
        return;
      }
      try {
        subscriber.next({ ...analyseGalaxy(input), thread: 'main' });
        subscriber.complete();
      } catch (error) {
        subscriber.error(error);
      }
    },
    (error: unknown) => subscriber.error(error),
  );
  return () => (cancelled = true);
}
