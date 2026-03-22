import { describe, it, expect } from 'vitest';
import { MinHeap } from '../utils/MinHeap';

describe('MinHeap', () => {
    it('should maintain min-heap property (ascending order)', () => {
        const heap = new MinHeap<{ val: number }>((a, b) => a.val - b.val);

        heap.push({ val: 10 });
        heap.push({ val: 5 });
        heap.push({ val: 20 });
        heap.push({ val: 1 });
        heap.push({ val: 15 });

        expect(heap.pop()?.val).toBe(1);
        expect(heap.pop()?.val).toBe(5);
        expect(heap.pop()?.val).toBe(10);
        expect(heap.pop()?.val).toBe(15);
        expect(heap.pop()?.val).toBe(20);
        expect(heap.size).toBe(0);
    });

    it('should return undefined when popping from empty heap', () => {
        const heap = new MinHeap<{ val: number }>((a, b) => a.val - b.val);
        expect(heap.pop()).toBeUndefined();
    });

    it('should report correct size', () => {
        const heap = new MinHeap<number>((a, b) => a - b);
        expect(heap.isEmpty()).toBe(true);
        heap.push(1);
        heap.push(2);
        expect(heap.size).toBe(2);
        expect(heap.isEmpty()).toBe(false);
    });
});
