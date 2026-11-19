import { Anchor, Breadcrumbs, Text } from '@mantine/core';
import { IconChevronRight } from '@tabler/icons-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { keyedBy } from '@/shared/lib/keyedBy';
import '@/shared/theme/Approved.css';
import './PageHeader.css';

export interface PageBreadcrumb {
  label: string;
  /** Makes the crumb a link back to that page. The last crumb is the current page and is never a link. */
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: string;
  /** Trail above the title, ending with the current page. Defaults to `parent › title` when `parent` is set. */
  breadcrumbs?: readonly PageBreadcrumb[];
  /** Shown beside the title, e.g. `4` or `4 experiments`. */
  count?: number | string;
  /** Left of the action bar: chips, status words, autosave state. */
  meta?: ReactNode;
  /** Right of the action bar. Use `HeaderButton`. */
  actions?: ReactNode;
  /** Tabs or other page navigation, below the action bar. */
  navigation?: ReactNode;
  /** Shown in the action bar meta. */
  status?: ReactNode;
  /** Shown in the action bar meta. */
  metadata?: ReactNode;
  /** Shown in the action bar meta, as plain muted text. */
  description?: string;
  /** Parent page name. Without `breadcrumbs`, the trail becomes `parent › title`. */
  parent?: string;
  /** Opens the parent page from its crumb. */
  onBack?: () => void;
  /** `detail` marks pages inside a collection. It does not change the layout. */
  variant?: 'collection' | 'detail';
  /** Id of the heading, for `aria-labelledby` and returning focus to the title. */
  titleId?: string;
}

const ChevronSeparator = (
  <IconChevronRight size={11} stroke={1.7} aria-hidden />
);

/**
 * Shared page header: an 88 px title area (breadcrumbs, then the title and its count)
 * and a 48 px action bar (meta on the left, header buttons on the right), shown when it has content.
 * A collection header with buttons and no meta shows the buttons on the title line instead,
 * and below 600 px in a row under the title, like the action bar.
 * Values from design/dvdash-field-review/shared-header-review.html.
 */
export function PageHeader({
  title,
  breadcrumbs,
  count,
  meta,
  actions,
  navigation,
  status,
  metadata,
  description,
  parent,
  onBack,
  variant,
  titleId,
}: PageHeaderProps) {
  const trail =
    breadcrumbs ??
    (parent ? [{ label: parent, onClick: onBack }, { label: title }] : []);
  const crumbs = keyedBy(trail, (crumb) => crumb.label);
  const detail = variant === 'detail' || !!parent || trail.length > 2;
  const hasMeta = meta || status || metadata || description;
  // A list page with buttons and nothing else for the action bar puts the buttons beside its title instead.
  const titleActions = !!actions && !hasMeta && !detail;
  return (
    <div
      className="dv-page-header"
      data-variant={detail ? 'detail' : 'collection'}
      data-actions={titleActions ? 'title' : undefined}
    >
      <header className="dv-page-header-title">
        <div className="dv-page-header-width">
          <nav className="dv-page-breadcrumbs" aria-label="Breadcrumb">
            {trail.length > 0 && (
              <Breadcrumbs
                separator={ChevronSeparator}
                separatorMargin={7}
                className="dv-page-crumbs"
              >
                {crumbs.map(({ key, item: crumb, index: i }) =>
                  i < trail.length - 1 && crumb.onClick ? (
                    <Anchor
                      key={key}
                      component="button"
                      type="button"
                      underline="never"
                      title={crumb.label}
                      onClick={crumb.onClick}
                    >
                      {crumb.label}
                    </Anchor>
                  ) : (
                    <Text
                      key={key}
                      span
                      title={crumb.label}
                      aria-current={i === trail.length - 1 ? 'page' : undefined}
                    >
                      {crumb.label}
                    </Text>
                  ),
                )}
              </Breadcrumbs>
            )}
          </nav>
          <div className="dv-page-title-line">
            <h1
              className="dv-page-title"
              id={titleId}
              tabIndex={-1}
              title={title}
            >
              {title}
            </h1>
            {count !== undefined && (
              <span className="dv-page-count">{count}</span>
            )}
          </div>
          {titleActions && <div className="dv-page-actions">{actions}</div>}
        </div>
      </header>
      {(hasMeta || (actions && !titleActions)) && (
        <div className="dv-page-actionbar">
          <div className="dv-page-header-width dv-page-actionbar-inner">
            <div className="dv-page-meta">
              {hasMeta && (
                <>
                  {meta}
                  {status}
                  {metadata && (
                    <span className="dv-page-metadata">{metadata}</span>
                  )}
                  {description && (
                    <span className="dv-page-description">{description}</span>
                  )}
                </>
              )}
            </div>
            {actions && !titleActions && (
              <div className="dv-page-actions">{actions}</div>
            )}
          </div>
        </div>
      )}
      {navigation && (
        <div className="dv-page-navigation">
          <div className="dv-page-header-width">{navigation}</div>
        </div>
      )}
    </div>
  );
}

export interface HeaderButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** `primary` is the filled accent button; `quiet` has no border. */
  variant?: 'default' | 'primary' | 'quiet';
  icon?: ReactNode;
}

/** The approved header button: 11 px text, 31 px tall, radius 5. */
export function HeaderButton({
  variant = 'default',
  icon,
  children,
  type = 'button',
  className,
  ...props
}: HeaderButtonProps) {
  return (
    <button
      type={type}
      className={
        className ? `dv-header-button ${className}` : 'dv-header-button'
      }
      data-variant={variant}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}
