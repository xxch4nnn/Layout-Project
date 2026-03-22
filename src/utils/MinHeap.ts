/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Generic min-heap with O(log n) push and O(log n) pop.
 */

export class MinHeap<T> {
    private heap: T[] = [];
    private compareFn: (a: T, b: T) => number;

    constructor(compareFn: (a: T, b: T) => number) {
        this.compareFn = compareFn;
    }

    get size(): number {
        return this.heap.length;
    }

    // For test compatibility
    sizeMethod(): number {
        return this.heap.length;
    }

    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    push(item: T): void {
        this.heap.push(item);
        this.bubbleUp(this.heap.length - 1);
    }

    pop(): T | undefined {
        if (this.heap.length === 0) return undefined;
        const top = this.heap[0];
        const last = this.heap.pop()!;
        if (this.heap.length > 0) {
            this.heap[0] = last;
            this.sinkDown(0);
        }
        return top;
    }

    peek(): T | undefined {
        return this.heap[0];
    }

    private bubbleUp(i: number): void {
        while (i > 0) {
            const parent = (i - 1) >>> 1;
            if (this.compareFn(this.heap[i], this.heap[parent]) < 0) {
                [this.heap[i], this.heap[parent]] = [this.heap[parent], this.heap[i]];
                i = parent;
            } else {
                break;
            }
        }
    }

    private sinkDown(i: number): void {
        const n = this.heap.length;
        while (true) {
            let smallest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;

            if (left < n && this.compareFn(this.heap[left], this.heap[smallest]) < 0) {
                smallest = left;
            }
            if (right < n && this.compareFn(this.heap[right], this.heap[smallest]) < 0) {
                smallest = right;
            }

            if (smallest !== i) {
                [this.heap[i], this.heap[smallest]] = [this.heap[smallest], this.heap[i]];
                i = smallest;
            } else {
                break;
            }
        }
    }
}
