// Lightbox for gallery images
document.addEventListener('DOMContentLoaded', function() {
  // Create lightbox element
  var lightbox = document.createElement('div');
  lightbox.id = 'lightbox';
  lightbox.style.cssText = 'display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:9999;justify-content:center;align-items:center;cursor:pointer;';

  var img = document.createElement('img');
  img.id = 'lightbox-img';
  img.style.cssText = 'max-width:90%;max-height:90%;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.5);';

  lightbox.appendChild(img);
  document.body.appendChild(lightbox);

  // Add click handlers to gallery images
  document.querySelectorAll('.gallery img').forEach(function(galleryImg) {
    galleryImg.addEventListener('click', function() {
      img.src = galleryImg.src;
      lightbox.style.display = 'flex';
    });
  });

  // Close on click
  lightbox.addEventListener('click', function() {
    lightbox.style.display = 'none';
  });
});
