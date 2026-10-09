# Paper Architecture Atlas

An independent collection of interactive, source-grounded research paper architecture visualizations. The site is static and publishes from the repository root with GitHub Pages.

**Live site:** https://yj244-jyt.github.io/paper-architecture-atlas/

## Current entries

- [Fast-WAM](papers/fast-wam/): animated inference, joint video/action training, structured attention masks, controlled variants, and paper-reported results.
- [RiEMann](papers/riemann/): full-scene RGB-D input, SE(3)-Transformer branches, training supervision, local equivariance, and illustrative robot actions.
- [3D Diffusion Policy](papers/dp3/): single-view depth to point cloud, DP3 Encoder, conditional action diffusion, training objective, and reported results.

Each visualization cites its primary paper. Procedural geometry, feature values, and trajectories are teaching reconstructions unless an entry explicitly says otherwise.

## Independent experiments

- [RiEMann backbone comparison](experiments/riemann-backbone-comparison/): an animated, English-language research report for the planned B0/M1/M2 controlled study. It is separate from the published-paper library. Expected speedups are hypotheses, not measured results.

The RiEMann paper explainer and backbone experiment use one shared procedural 3D scene implementation at `shared/riemann-scene3d.js`; the table and robot are not redrawn for the experiment. The scene still uses the RiEMann page's bundled Three.js r128 (MIT).

## Add a paper

1. Create a self-contained directory at papers/<paper-slug>/ with an index.html entry point. Use relative links so the page works under the GitHub Pages project path.
2. Add its metadata to catalog.js: title, authors, venue, topics, summary, preview path, local path, paper URL, and official code URL. The library search and topic filters update automatically.
3. Add a preview image under assets/. Use an original visualization or an image with redistribution permission, and document any external assets.
4. Verify the paper's equations, architecture, and training claims against the primary source. Label illustrative values and unspecified implementation details.
5. Test the root library, the paper page, desktop/mobile layouts, and all interactive views. Push to main; GitHub Pages republishes from the repository root.

No build tools are required. For local preview, run "python3 -m http.server 8000" in the repository root and open http://localhost:8000/.

## Publishing

In GitHub repository Settings > Pages, select **Deploy from a branch**, branch **main**, folder **/(root)**. The public URL is https://yj244-jyt.github.io/paper-architecture-atlas/.

The RiEMann visualization bundles Three.js r128 (MIT) and MathJax 3.2.2 (Apache-2.0) for reliable offline rendering. See [third-party notices](THIRD_PARTY.md).
