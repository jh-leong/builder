// ==UserScript==
// @name         图片放大预览
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  支持Alt+左键点击图片进行放大预览，支持触摸板双指放大、鼠标滚轮放大、拖拽
// @author       You
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 预览容器
    let previewContainer = null;
    let previewImage = null;
    let isPreviewOpen = false;
    let currentScale = 1;
    let currentTranslateX = 0;
    let currentTranslateY = 0;
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let dragStartTranslateX = 0;
    let dragStartTranslateY = 0;

    // 触摸相关
    let touchStartDistance = 0;
    let touchStartScale = 1;
    let touchStartCenterX = 0;
    let touchStartCenterY = 0;
    let isPinching = false;

    // 创建预览容器
    function createPreviewContainer() {
        const container = document.createElement('div');
        container.id = 'image-preview-container';
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.9);
            z-index: 999999;
            display: none;
            align-items: center;
            justify-content: center;
            cursor: grab;
            user-select: none;
        `;

        const img = document.createElement('img');
        img.id = 'image-preview-img';
        img.style.cssText = `
            max-width: 90%;
            max-height: 90%;
            object-fit: contain;
            transition: transform 0.1s ease-out;
            transform-origin: center center;
            pointer-events: auto;
            cursor: grab;
        `;

        container.appendChild(img);
        document.body.appendChild(container);

        previewContainer = container;
        previewImage = img;

        // 点击蒙层关闭
        container.addEventListener('click', function(e) {
            if (e.target === container) {
                closePreview();
            }
        });

        // ESC键关闭
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && isPreviewOpen) {
                closePreview();
            }
        });

        // 鼠标滚轮缩放
        container.addEventListener('wheel', handleWheel, { passive: false });

        // 触摸事件
        container.addEventListener('touchstart', handleTouchStart, { passive: false });
        container.addEventListener('touchmove', handleTouchMove, { passive: false });
        container.addEventListener('touchend', handleTouchEnd, { passive: false });

        // 鼠标拖拽
        container.addEventListener('mousedown', handleMouseDown);
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        container.addEventListener('mouseleave', handleMouseUp);
    }

    // 打开预览
    function openPreview(imgSrc) {
        if (!previewContainer) {
            createPreviewContainer();
        }

        previewImage.src = imgSrc;
        previewContainer.style.display = 'flex';
        isPreviewOpen = true;
        currentScale = 0.8; // 初始缩放为80%，避免默认太大
        currentTranslateX = 0;
        currentTranslateY = 0;
        updateTransform();
        document.body.style.overflow = 'hidden';
    }

    // 关闭预览
    function closePreview() {
        if (previewContainer) {
            previewContainer.style.display = 'none';
            isPreviewOpen = false;
            currentScale = 0.8; // 重置为初始缩放
            currentTranslateX = 0;
            currentTranslateY = 0;
            document.body.style.overflow = '';
        }
    }

    // 更新变换
    function updateTransform() {
        if (previewImage) {
            previewImage.style.transform = `translate(${currentTranslateX}px, ${currentTranslateY}px) scale(${currentScale})`;
        }
    }

    // 限制缩放范围
    function constrainScale(scale) {
        return Math.max(0.5, Math.min(scale, 5));
    }

    // 限制平移范围
    function constrainTranslate() {
        if (!previewImage) return;

        // 获取当前transform下的图片尺寸（已包含scale）
        const rect = previewImage.getBoundingClientRect();
        const containerRect = previewContainer.getBoundingClientRect();
        
        // 计算原始显示尺寸（不受transform影响）
        // getBoundingClientRect返回的尺寸已经包含了scale，所以需要除以scale得到原始尺寸
        const baseWidth = rect.width / currentScale;
        const baseHeight = rect.height / currentScale;
        
        // 计算缩放后的实际尺寸
        const scaledWidth = baseWidth * currentScale;
        const scaledHeight = baseHeight * currentScale;
        
        // 如果图片小于容器，允许自由拖拽（设置一个较大的范围）
        if (scaledWidth <= containerRect.width && scaledHeight <= containerRect.height) {
            // 允许自由拖拽，设置一个合理的范围避免拖得太远
            const maxX = Math.max(200, containerRect.width);
            const maxY = Math.max(200, containerRect.height);
            currentTranslateX = Math.max(-maxX, Math.min(maxX, currentTranslateX));
            currentTranslateY = Math.max(-maxY, Math.min(maxY, currentTranslateY));
        } else {
            // 如果图片大于容器，限制在边界内
            const maxX = (scaledWidth - containerRect.width) / 2;
            const maxY = (scaledHeight - containerRect.height) / 2;
            currentTranslateX = Math.max(-maxX, Math.min(maxX, currentTranslateX));
            currentTranslateY = Math.max(-maxY, Math.min(maxY, currentTranslateY));
        }
    }

    // 鼠标滚轮缩放
    function handleWheel(e) {
        if (!isPreviewOpen) return;

        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY;
        // 降低缩放速度，每次缩放约2%，更精准
        const zoomFactor = delta > 0 ? 0.98 : 1.02;
        
        // 获取鼠标位置相对于图片的位置
        const rect = previewImage.getBoundingClientRect();
        const mouseX = e.clientX - rect.left - rect.width / 2;
        const mouseY = e.clientY - rect.top - rect.height / 2;

        const oldScale = currentScale;
        currentScale = constrainScale(currentScale * zoomFactor);

        // 以鼠标位置为中心缩放
        const scaleChange = currentScale / oldScale;
        currentTranslateX = mouseX * (1 - scaleChange) + currentTranslateX * scaleChange;
        currentTranslateY = mouseY * (1 - scaleChange) + currentTranslateY * scaleChange;

        constrainTranslate();
        updateTransform();
    }

    // 触摸开始
    function handleTouchStart(e) {
        if (!isPreviewOpen) return;

        if (e.touches.length === 2) {
            // 双指缩放
            isPinching = true;
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            touchStartDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            touchStartScale = currentScale;
            
            touchStartCenterX = (touch1.clientX + touch2.clientX) / 2;
            touchStartCenterY = (touch1.clientY + touch2.clientY) / 2;
            
            e.preventDefault();
        } else if (e.touches.length === 1) {
            // 单指拖拽
            isDragging = true;
            const touch = e.touches[0];
            dragStartX = touch.clientX;
            dragStartY = touch.clientY;
            dragStartTranslateX = currentTranslateX;
            dragStartTranslateY = currentTranslateY;
        }
    }

    // 触摸移动
    function handleTouchMove(e) {
        if (!isPreviewOpen) return;

        if (e.touches.length === 2 && isPinching) {
            // 双指缩放
            const touch1 = e.touches[0];
            const touch2 = e.touches[1];
            
            const currentDistance = Math.hypot(
                touch2.clientX - touch1.clientX,
                touch2.clientY - touch1.clientY
            );
            
            const scaleChange = currentDistance / touchStartDistance;
            currentScale = constrainScale(touchStartScale * scaleChange);

            // 以双指中心为缩放中心
            const rect = previewImage.getBoundingClientRect();
            const centerX = (touch1.clientX + touch2.clientX) / 2;
            const centerY = (touch1.clientY + touch2.clientY) / 2;
            
            const imageCenterX = centerX - rect.left - rect.width / 2;
            const imageCenterY = centerY - rect.top - rect.height / 2;

            const scaleRatio = currentScale / touchStartScale;
            currentTranslateX = imageCenterX * (1 - scaleRatio) + dragStartTranslateX * scaleRatio;
            currentTranslateY = imageCenterY * (1 - scaleRatio) + dragStartTranslateY * scaleRatio;

            constrainTranslate();
            updateTransform();
            e.preventDefault();
        } else if (e.touches.length === 1 && isDragging) {
            // 单指拖拽
            const touch = e.touches[0];
            const deltaX = touch.clientX - dragStartX;
            const deltaY = touch.clientY - dragStartY;
            
            currentTranslateX = dragStartTranslateX + deltaX;
            currentTranslateY = dragStartTranslateY + deltaY;
            
            constrainTranslate();
            updateTransform();
            e.preventDefault();
        }
    }

    // 触摸结束
    function handleTouchEnd(e) {
        if (e.touches.length < 2) {
            isPinching = false;
        }
        if (e.touches.length === 0) {
            isDragging = false;
        }
    }

    // 鼠标按下
    function handleMouseDown(e) {
        if (!isPreviewOpen || e.button !== 0) return; // 只处理左键
        
        // 点击图片或容器都可以拖拽（但点击容器背景会关闭预览，所以主要是在图片上拖拽）
        if (e.target === previewImage || e.target === previewContainer) {
            // 如果点击的是容器背景，不拖拽（会触发关闭）
            if (e.target === previewContainer) {
                return;
            }
            
            isDragging = true;
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragStartTranslateX = currentTranslateX;
            dragStartTranslateY = currentTranslateY;
            previewContainer.style.cursor = 'grabbing';
            previewImage.style.transition = 'none'; // 拖拽时禁用过渡，更流畅
            e.preventDefault();
        }
    }

    // 鼠标移动
    function handleMouseMove(e) {
        if (!isPreviewOpen) return;
        
        // 如果正在拖拽，更新位置
        if (isDragging) {
            const deltaX = e.clientX - dragStartX;
            const deltaY = e.clientY - dragStartY;
            
            currentTranslateX = dragStartTranslateX + deltaX;
            currentTranslateY = dragStartTranslateY + deltaY;
            
            constrainTranslate();
            updateTransform();
        } else {
            // 未拖拽时，根据鼠标位置更新光标样式
            if (e.target === previewImage) {
                previewContainer.style.cursor = 'grab';
            }
        }
    }

    // 鼠标释放
    function handleMouseUp(e) {
        if (isDragging) {
            isDragging = false;
            previewContainer.style.cursor = 'grab';
            // 恢复过渡效果
            if (previewImage) {
                previewImage.style.transition = 'transform 0.1s ease-out';
            }
        }
    }

    // 监听图片点击事件
    document.addEventListener('click', function(e) {
        // Alt + 左键点击
        if (e.altKey && e.button === 0) {
            let target = e.target;
            
            // 查找图片元素
            while (target && target !== document.body) {
                if (target.tagName === 'IMG') {
                    const imgSrc = target.src || target.getAttribute('data-src') || target.getAttribute('data-lazy-src');
                    if (imgSrc) {
                        e.preventDefault();
                        e.stopPropagation();
                        openPreview(imgSrc);
                        return;
                    }
                }
                target = target.parentElement;
            }
        }
    }, true);

    // 初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createPreviewContainer);
    } else {
        createPreviewContainer();
    }

})();

