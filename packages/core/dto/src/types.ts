// oxlint-disable typescript/no-empty-object-type
// oxlint-disable typescript/ban-types
import type z from 'zod';

/* =======================================================
   META
======================================================= */

export interface INodeMeta {
  [key: string]: string | number | boolean | INodeMeta | INodeMeta[];
}

/* =======================================================
   BASE NODE
======================================================= */

export interface INode<TName extends string = string, TData = unknown> {
  readonly id: string;
  readonly name: TName;
  readonly meta?: INodeMeta;
  readonly data?: TData;
  readonly children?: readonly INode[];
  readonly mods?: readonly INode[];
  readonly out?: INode;
}

/* =======================================================
   DATA
======================================================= */

export interface IDataInfo<T extends z.ZodType = z.ZodType> {
  type: T;
  default: () => z.infer<T>;
}

/* =======================================================
   CONFIG
======================================================= */

export type IOutType = 'break' | 'continue' | 'return' | 'throw';

export interface INodeConfig<
  TName extends string = string,
  TData extends z.ZodType = z.ZodType,
  TChildren extends readonly string[] | true = string[],
  TTuple extends readonly string[] = string[],
> {
  readonly name: TName;

  readonly data?: IDataInfo<TData>;

  /**
   * children: true
   * any node[]
   *
   * children: ['expr', 'stmt']
   * array of allowed node types
   */
  readonly children?: true | TChildren;

  /**
   * fixed positional tuple
   */
  readonly childTuple?: TTuple;

  readonly haveMods?: boolean;
  readonly haveOut?: boolean;
  readonly outType?: IOutType;

  /**
   * Marks a node kind as only ever valid as a document's own `root` (e.g. `function`,
   * `trigger-function`, `objects-structure`, `contour`, `mind-tree`) — never as a child of another
   * node, even where that other node's own `children` policy is `true` ("any node from the stack").
   * Without this, a `children: true` container (e.g. `function-body`) would accept a document-root
   * kind nested inside it whenever both share one `NodesStack` — which the workflow product's
   * `function`/`trigger-function` documents do by design (see ADR 0002 (private)) — silently
   * producing a structurally invalid document that still passes `NodesStack.parseDocument`.
   */
  readonly documentRootOnly?: boolean;

  /**
   * With `children: true`: node kinds that are NOT accepted as children of this node (e.g. `magic`
   * inside `magic`). Enforced by `createZodUnion` and honoured by `@falang/mcp-core`'s
   * `getAllowedChildNames`. Meaningless for other children policies.
   */
  readonly excludeChildren?: readonly string[];

  readonly factory?: () => INode;
}

/* =======================================================
   HELPERS
======================================================= */

export type NodeName<TList extends readonly INodeConfig[]> = TList[number]['name'];

export type NodeByName<TList extends readonly INodeConfig[], TName extends NodeName<TList>> = Extract<
  NodesFromConfig<TList>,
  { name: TName }
>;

/* =======================================================
   CHILD HELPERS
======================================================= */

type TupleChildren<TList extends readonly INodeConfig[], TTuple extends readonly string[]> = {
  readonly [K in keyof TTuple]: TTuple[K] extends NodeName<TList> ? NodeByName<TList, TTuple[K]> : never;
};

/* =======================================================
   NODE FROM CONFIG ITEM
======================================================= */

export type NodeFromConfigItem<TList extends readonly INodeConfig[], C extends TList[number]> = Omit<
  INode<C['name']>,
  'children' | 'mods' | 'out'
> &
  /* ---------- data ---------- */
  (C extends { data: IDataInfo<infer TSchema> } ? { readonly data: z.infer<TSchema> } : {}) &
  /* ---------- children ---------- */
  (C extends { childTuple: readonly string[] }
    ? {
        readonly children: TupleChildren<TList, C['childTuple']>;
      }
    : C extends { children: true }
      ? {
          readonly children: readonly INode[];
        }
      : C extends {
            children: readonly (infer N extends NodeName<TList>)[];
          }
        ? {
            readonly children: readonly Extract<NodesFromConfig<TList>, { name: N }>[];
          }
        : { readonly children?: readonly INode[] }) &
  /* ---------- mods ---------- */
  (C extends { haveMods: true }
    ? {
        readonly mods: readonly NodesFromConfig<TList>[];
      }
    : { readonly mods?: readonly INode[] }) &
  /* ---------- out ---------- */
  (C extends { haveOut: true }
    ? {
        readonly out?: NodesFromConfig<TList>;
      }
    : { readonly out?: INode });

/* =======================================================
   UNION OF ALL NODES
======================================================= */

export type NodesFromConfig<TList extends readonly INodeConfig[]> = TList[number] extends infer C
  ? C extends TList[number]
    ? NodeFromConfigItem<TList, C>
    : never
  : never;
