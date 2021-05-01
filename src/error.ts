class CustomError extends Error {
  constructor(message: string, name?: string) {
    super();
    Error.captureStackTrace(this, this.constructor);
    this.name = name ?? 'EnhancedMapError';
    this.message = message;
  }
}

export class EnhancedMapError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapError');
  }
}

export class EnhancedMapDatabaseConnectionError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapDatabaseConnectionError');
  }
}

export class EnhancedMapTypeError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapTypeError');
  }
}

export class EnhancedMapPathError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapPathError');
  }
}

export class EnhancedMapImportError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapImportError');
  }
}

export class EnhancedMapDestroyedError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapDestroyedError');
  }
}

export class EnhancedMapKeyError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapKeyError');
  }
}

export class EnhancedMapKeyTypeError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapKeyTypeError');
  }
}

export class EnhancedMapArgumentError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapArgumentError');
  }
}

export class EnhancedMapOptionsError extends CustomError {
  constructor(message: string) {
    super(message, 'EnhancedMapError');
  }
}
