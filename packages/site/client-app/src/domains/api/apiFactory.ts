import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

const BASE_URL = window.location.hostname.includes('falang') ? 'https://api.falang.io/' : 'http://localhost:8080/';

const sendPost = async (method: 'DELETE' | 'POST' | 'PUT', uri: string, data: any): Promise<any> => {
  const rawResponse = await fetch(`${BASE_URL}${uri}`, {
    method,
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const content = await rawResponse.json();
  if(content.statusCode && content.statusCode !== 200) {
    const message = Array.isArray(content.message) ? content.message.join('\n') : content.message;
    throw new Error(message);
  }
  return content;
}

const sendGet = async(uri: string, data?: any): Promise<any> => {
  const url = new URL(`${BASE_URL}${uri}`);
  if (data) {
    url.search = new URLSearchParams(data).toString();
  }
  const rawResponse = await fetch(url.toString(), {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }, 
  });
  const content = await rawResponse.json();
  if(content.statusCode && content.statusCode !== 200) {
    const message = Array.isArray(content.message) ? content.message.join('\n') : content.message;
    throw new Error(message);
  }
  return content;
}

type ObjectType<T> = {
  new(): T
}

export class ApiValidationError extends Error {
  constructor(public errors: ValidationError[]) {
    super(errors.map(e => e.toString()).join('; '));
  }
}

export class EmptyDto {}

export const apiFactory = <TRequest extends object = EmptyDto, TResponse extends object = EmptyDto>(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  uri: string,
  requestDtoType: ObjectType<TRequest>,
  responseDtoType: ObjectType<TResponse>,
): (dto: TRequest) => Promise<TResponse> => {
  return async (dto: TRequest): Promise<TResponse> => {
    if(requestDtoType !== null) {
        const dtoObject = plainToInstance(requestDtoType, dto); 
        const validateResult = await validate(dtoObject as object);
        if(validateResult.length) {
          throw new ApiValidationError(validateResult);
        }        
    }
    let response: any;
    if(method === 'GET') {
      response = await sendGet(uri, dto);
    } else {
      response = await sendPost(method, uri, dto);
    }   
    const responseDto = plainToInstance(responseDtoType, response);
    const responseValidationResult = await validate(responseDto);
    if(responseValidationResult.length) {
      console.error('Response not validated', {
        uri,
        method,
        dto,
        responseDto,
        errors: responseValidationResult,
      });
    }
    return responseDto;
  };
};
