function cloudinaryUrl(src: string, transformation: string) {
  try {
    const url = new URL(src);
    if (url.hostname !== "res.cloudinary.com") return src;
    return src.replace("/image/upload/", `/image/upload/${transformation}/`);
  } catch {
    return src;
  }
}

export const profileThumbnailUrl = (src: string) =>
  cloudinaryUrl(src, "f_auto,q_auto,c_fill,g_auto,w_256,h_256");

export const profileDisplayUrl = (src: string) =>
  cloudinaryUrl(src, "f_auto,q_auto,c_limit,w_1600,h_1600");
