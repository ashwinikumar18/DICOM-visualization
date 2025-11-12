// src/utils/dicomParser.js
import * as dicomParser from 'dicom-parser';

export class DicomProcessor {
  constructor() {
    this.slices = [];
    this.metadata = null;
  }

  /**
   * Parse one or more DICOM files.
   * @param {FileList|File[]} files
   */
  async parseFiles(files) {
    if (!files || files.length === 0) {
      throw new Error('No DICOM files provided');
    }

    this.slices = [];
    this.metadata = null;

    // Parse each file sequentially (you can parallelize later)
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const arrayBuffer = await this.fileToArrayBuffer(file);
        const byteArray = new Uint8Array(arrayBuffer);
        const dataSet = dicomParser.parseDicom(byteArray);

        const slice = this.extractSliceData(dataSet, i);
        this.slices.push(slice);

        // Store metadata from the first slice
        if (i === 0) {
          this.metadata = this.extractMetadata(dataSet);
        }
      } catch (error) {
        console.error(`Error parsing DICOM file: ${file.name}`, error);
      }
    }

    // Sort slices by Z position
    this.slices.sort((a, b) => a.position[2] - b.position[2]);

    return {
      slices: this.slices,
      metadata: this.metadata,
      dimensions: this.calculateDimensions()
    };
  }

  /**
   * Support both single and multiple DICOM uploads.
   */
  async parseFileList(fileList) {
    if (!fileList) throw new Error('No files provided');
    const files = Array.from(fileList).filter(f => f.name.toLowerCase().endsWith('.dcm'));
    if (files.length === 0) {
      throw new Error('No valid DICOM (.dcm) files found');
    }
    return await this.parseFiles(files);
  }

  fileToArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }

  extractSliceData(dataSet, index) {
    const pixelDataElement = dataSet.elements.x7fe00010;
    if (!pixelDataElement) {
      throw new Error('No PixelData found');
    }

    const pixelData = new Uint16Array(
      dataSet.byteArray.buffer,
      dataSet.byteArray.byteOffset + pixelDataElement.dataOffset,
      pixelDataElement.length / 2
    );

    const width = dataSet.uint16('x00280011') || 512;
    const height = dataSet.uint16('x00280010') || 512;

    return {
      index,
      pixelData,
      width,
      height,
      position: this.getImagePosition(dataSet),
      orientation: this.getImageOrientation(dataSet),
      sliceThickness: dataSet.floatString('x00180050') || 1.0,
      spacingBetweenSlices: dataSet.floatString('x00180088') || 1.0,
    };
  }

  extractMetadata(dataSet) {
    return {
      patientName: dataSet.string('x00100010') || 'Unknown',
      studyDescription: dataSet.string('x00081030') || 'Unknown',
      pixelSpacing: this.getPixelSpacing(dataSet),
      sliceThickness: dataSet.floatString('x00180050') || 1.0,
    };
  }

  getImagePosition(dataSet) {
    const pos = dataSet.string('x00200032');
    return pos ? pos.split('\\').map(parseFloat) : [0, 0, 0];
  }

  getImageOrientation(dataSet) {
    const ori = dataSet.string('x00200037');
    return ori ? ori.split('\\').map(parseFloat) : [1, 0, 0, 0, 1, 0];
  }

  getPixelSpacing(dataSet) {
    const ps = dataSet.string('x00280030');
    return ps ? ps.split('\\').map(parseFloat) : [1.0, 1.0];
  }

  calculateDimensions() {
    if (this.slices.length === 0) return { width: 0, height: 0, depth: 0 };

    const first = this.slices[0];
    const pixelSpacing = this.metadata?.pixelSpacing || [1, 1];
    const sliceThickness = this.metadata?.sliceThickness || 1.0;

    return {
      width: first.width,
      height: first.height,
      depth: this.slices.length,
      pixelSpacing,
      sliceThickness,
    };
  }
}