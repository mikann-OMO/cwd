/**
 * CommentList 评论列表容器组件
 */

import { Component } from './Component.js';
import { CommentItem } from './CommentItem.js';
import { Loading } from './Loading.js';
import { Pagination } from './Pagination.js';

const MOBILE_THRESHOLD = 768;
const isMobileDevice = typeof window !== 'undefined' && window.innerWidth <= MOBILE_THRESHOLD;

export class CommentList extends Component {
  constructor(container, props = {}) {
    super(container, props);
    this.t = props.t || ((k) => k);
    this.loadingComponent = null;
    this.paginationComponent = null;
    this.commentItems = new Map();
    this._renderScheduled = false;
    this._pendingProps = null;
  }

  render() {
    const { comments, loading, error, currentPage, totalPages } = this.props;
    this.empty(this.container);

    if (loading && comments.length === 0) {
      this.loadingComponent = new Loading(this.container, { text: '加载评论中...' });
      this.loadingComponent.render();
      this.elements.root = this.loadingComponent.elements.root;
      return;
    }

    if (error && comments.length === 0) {
      const errorEl = this.createElement('div', {
        className: 'cwd-error',
        children: [
          this.createTextElement('span', error),
          this.createElement('button', {
            className: 'cwd-error-retry',
            attributes: {
              type: 'button',
              onClick: () => this.handleRetry()
            },
            text: '重试'
          })
        ]
      });
      this.elements.root = errorEl;
      this.container.appendChild(errorEl);
      return;
    }

    const root = this.createElement('div', {
      className: 'cwd-comment-list'
    });

    if (comments.length > 0) {
      const commentsContainer = this.createElement('div', {
        className: 'cwd-comments'
      });

      this.commentItems.clear();

      if (isMobileDevice && comments.length > 10) {
        this._renderCommentsBatched(commentsContainer, comments, 0);
      } else {
        comments.forEach((comment) => {
          this._renderCommentItem(commentsContainer, comment);
        });
      }

      root.appendChild(commentsContainer);
    } else {
      const emptyEl = this.createElement('div', {
        className: 'cwd-empty',
        children: [
          this.createTextElement('p', this.t('noComments'), 'cwd-empty-text')
        ]
      });
      root.appendChild(emptyEl);
    }

    if (totalPages > 1) {
      const paginationContainer = this.createElement('div');
      root.appendChild(paginationContainer);

      this.paginationComponent = new Pagination(paginationContainer, {
        currentPage,
        totalPages,
        onPrev: () => this.handlePrevPage(),
        onNext: () => this.handleNextPage(),
        onGoTo: (page) => this.handleGoToPage(page)
      });
      this.paginationComponent.render();
    } else {
      this.paginationComponent = null;
    }

    this.elements.root = root;
    this.container.appendChild(root);
  }

  _renderCommentsBatched(container, comments, startIndex) {
    const batchSize = 5;
    const endIndex = Math.min(startIndex + batchSize, comments.length);

    for (let i = startIndex; i < endIndex; i++) {
      this._renderCommentItem(container, comments[i]);
    }

    if (endIndex < comments.length) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(() => {
          this._renderCommentsBatched(container, comments, endIndex);
        }, { timeout: 100 });
      } else {
        setTimeout(() => {
          this._renderCommentsBatched(container, comments, endIndex);
        }, 16);
      }
    }
  }

  _renderCommentItem(container, comment) {
    const commentItem = new CommentItem(container, {
      comment,
      replyingTo: this.props.replyingTo,
      replyContent: this.props.replyContent,
      replyError: this.props.replyError,
      submitting: this.props.submitting,
      currentUser: this.props.currentUser,
      onUpdateUserInfo: this.props.onUpdateUserInfo,
      adminBadge: this.props.adminBadge,
      enableCommentLike: this.props.enableCommentLike,
      replyPlaceholder: this.props.replyPlaceholder,
      isCommentLiked: this.props.isCommentLiked,
      onReply: (commentId) => this.handleReply(commentId),
      onSubmitReply: (commentId) => this.handleSubmitReply(commentId),
      onCancelReply: () => this.handleCancelReply(),
      onUpdateReplyContent: (content) => this.handleUpdateReplyContent(content),
      onClearReplyError: () => this.handleClearReplyError(),
      onLikeComment: (commentId, isLike) => this.handleLikeComment(commentId, isLike),
      t: this.props.t
    });
    commentItem.render();
    this.commentItems.set(comment.id, commentItem);
  }

  updateProps(prevProps) {
    if (this.props.loading !== prevProps.loading && !this.props.loading) {
      this.render();
      return;
    }

    if (this.props.comments !== prevProps.comments) {
      this.render();
      return;
    }

    if (this.props.replyingTo !== prevProps.replyingTo ||
        this.props.replyError !== prevProps.replyError ||
        this.props.submitting !== prevProps.submitting ||
        this.props.currentUser !== prevProps.currentUser) {
      this._scheduleUpdate(() => {
        this.commentItems.forEach((commentItem) => {
          commentItem.setProps({
            replyingTo: this.props.replyingTo,
            replyContent: this.props.replyContent,
            replyError: this.props.replyError,
            submitting: this.props.submitting,
            currentUser: this.props.currentUser,
            enableCommentLike: this.props.enableCommentLike,
            onLikeComment: (commentId, isLike) => this.handleLikeComment(commentId, isLike)
          });
        });
      });
      return;
    }

    if (this.paginationComponent) {
      const pageChanged =
        this.props.currentPage !== prevProps.currentPage ||
        this.props.totalPages !== prevProps.totalPages;

      if (pageChanged) {
        this.paginationComponent.props.currentPage = this.props.currentPage;
        this.paginationComponent.props.totalPages = this.props.totalPages;
        this.paginationComponent.updateProps();
      }
    }
  }

  _scheduleUpdate(updateFn) {
    if (isMobileDevice) {
      this._pendingProps = updateFn;
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        requestAnimationFrame(() => {
          this._renderScheduled = false;
          if (this._pendingProps) {
            this._pendingProps();
            this._pendingProps = null;
          }
        });
      }
    } else {
      updateFn();
    }
  }

  handleRetry() {
    if (this.props.onRetry) {
      this.props.onRetry();
    }
  }

  handleReply(commentId) {
    if (this.props.onReply) {
      this.props.onReply(commentId);
    }
  }

  handleSubmitReply(commentId) {
    if (this.props.onSubmitReply) {
      this.props.onSubmitReply(commentId);
    }
  }

  handleCancelReply() {
    if (this.props.onCancelReply) {
      this.props.onCancelReply();
    }
  }

  handleUpdateReplyContent(content) {
    if (this.props.onUpdateReplyContent) {
      this.props.onUpdateReplyContent(content);
    }
  }

  handleClearReplyError() {
    if (this.props.onClearReplyError) {
      this.props.onClearReplyError();
    }
  }

  handleLikeComment(commentId, isLike) {
    if (this.props.onLikeComment) {
      this.props.onLikeComment(commentId, isLike);
    }
  }

  handlePrevPage() {
    if (this.props.onPrevPage) {
      this.props.onPrevPage();
    }
  }

  handleNextPage() {
    if (this.props.onNextPage) {
      this.props.onNextPage();
    }
  }

  handleGoToPage(page) {
    if (this.props.onGoToPage) {
      this.props.onGoToPage(page);
    }
  }
}
